+++
title = "Making network anonymization practical"
date = 2026-10-08
author = "Joris D.C. Alkema"
tags = ["network science", "privacy", "algorithms", "optimization"]
description = "How my MSc thesis and accepted paper developed faster and more effective search for network anonymization."
draft = false
style = "research-article.css"
+++

{{< research-publication >}}

A practical look at speeding up network anonymization: what to update, what to cache, and how to use the time saved to find better solutions.

Suppose someone knows that you have seven contacts, and that three pairs of those contacts also know each other. If only one person in a published network fits that description, removing your name has not done much to hide you.

This is why sharing network data takes more than removing names. We want researchers to study the connections, while reducing the risk that those connections identify people. [Earlier work](https://cs.colgate.edu/~mhay/assets/publications/hay2008resisting.pdf) studied this risk; the challenge is turning an anonymity model into something we can compute and improve on larger networks.

My MSc thesis at Leiden University started with an existing greedy algorithm developed by my supervisor, Prof. Dr. Frank W. Takes, and presented in [joint work with Rachel de Jong and Mark van der Loo](https://arxiv.org/abs/2605.12062). It repeatedly chooses a connection to remove based on the immediate improvement in anonymity. The implementation was available, but slow. I was interested in optimizing it.

The project developed from there: **avoid repeated work, then use the faster implementation to explore better choices.** Making evaluation cheaper meant I could investigate more search strategies. The broader aim is to make effective network anonymization practical as networks get larger.

Across 17 test networks, the median solver time fell from 17 minutes to under half a second while preserving the greedy algorithm’s choices. Further changes to the search improved the results within the same deletion budget.

This post follows that process, from profiling the original implementation to finding better deletion sets.

The C++ implementation is available in [OptiAnon](https://github.com/JorisAlkema/optianon/tree/paper/2026-fast-effective-search). The pseudocode below leaves out bookkeeping so we can focus on how the methods work.

## What makes a node stand out?

For each node, we count its neighbours and the triangles it belongs to. A triangle means that two of its neighbours are also connected. Together, those two counts form its **signature**.

signature = (degree, triangle count) — Degree is the number of neighbours.

Earlier work by Rachel, Mark, and Frank developed [efficient ways to compare neighbourhood structure](https://doi.org/10.1145/3604908). Here, we use a simpler description: degree and triangle count, matched exactly.

Nodes with the same signature belong to the same group. A group with one member makes that node unique. Our objective is to reduce the number of unique nodes while deleting **at most 5% of the original edges**, following the [budgeted anonymization setting](https://arxiv.org/abs/2409.16163) from their earlier work.

That budget limits how much we change the network. It does not guarantee that every later analysis will be unaffected, or that a person with more detailed knowledge cannot identify someone. It gives us a specific problem we can measure and optimize.

## First, find the repeated work

The reference greedy algorithm tries every remaining edge at each step and picks the deletion that gives the best immediate change in the number of unique nodes.

{{< research-algorithm number="01" title="The reference greedy loop" >}}
best = current deletion set
while deletions < budget and best.unique_nodes > 0:
    for each remaining edge:
        temporarily delete edge
        rebuild states and groups
        score[edge] = unique_nodes_after - unique_nodes_before
        undo deletion
    delete edge with smallest (score, edge_id)
    keep current set if it improves best
return best
{{< /research-algorithm >}}

The expensive part is inside the loop: temporarily changing the graph, rebuilding signature groups, and undoing the change—for every candidate, at every step.

I used Linux `perf` to find where the time went. The changes that followed were mostly about retaining information between evaluations. There was no need to rediscover the entire graph after changing one edge.

### Keep the node counters and group sizes

Deleting an edge *u–v* changes only its endpoints and their common neighbours. Each endpoint loses one neighbour. Both endpoints lose one triangle per common neighbour, and each common neighbour loses one triangle.

Arrays make those updates straightforward: `degree[node]` and `triangles[node]`. A hash table keeps the number of nodes with each signature. When a node changes signature, we decrease its old group’s count and increase its new group’s count.

For uniqueness, the important boundary is a group size of one. Going from two members to one creates a unique node; going from one to two removes one. Going from five to four changes nothing in the unique-node total.

When I profiled the algorithm on the Arenas email network, runtime dropped from about **235 seconds to 127 seconds** after maintaining node counters, then to **2.35 seconds** after maintaining the groups and unique-node count as well. These timings show the effect of each change on that network. Avoiding the full-graph scan was the much bigger gain.

{{< research-data-structures >}}

The implementation gives nodes and edges integer IDs. Most working state can then live in arrays. The signature counts need a map because only some degree–triangle pairs occur in a particular graph.

{{< research-algorithm number="02" title="The state we keep" >}}
neighbours[node]   : sorted array of (neighbour_id, edge_id)
degree[node]       : integer
triangles[node]    : integer
class_count[state] : integer, default 0

deleted[edge]      : boolean
priority[edge]     : current priority tuple
dependencies[edge] : sorted list of signature keys
heap               : min-heap of priority tuples
{{< /research-algorithm >}}

Neighbour entries include an edge ID, so an intersection can skip deleted edges. The arrays remain sorted. Finding common neighbours is a two-pointer walk through the endpoint lists, rather than building a fresh set for every candidate.

### Predict a deletion without applying it

Once the counts are available, we can calculate a candidate’s effect without editing the graph. First work out the proposed signatures. Then collect all departures and arrivals for each group.

{{< research-algorithm number="03" title="Predict a deletion" >}}
preview(u, v):
    common = live_neighbours(u) intersect live_neighbours(v)
    proposed[u] = (degree[u] - 1, triangles[u] - len(common))
    proposed[v] = (degree[v] - 1, triangles[v] - len(common))
    for node in common:
        proposed[node] = (degree[node], triangles[node] - 1)

    changes = empty map with default 0
    for node, new_state in proposed:
        changes[state(node)] -= 1
        changes[new_state]   += 1

    delta_U = 0
    for state, change in changes:
        before = class_count[state]
        after  = before + change
        delta_U += (1 if after == 1 else 0)
        delta_U -= (1 if before == 1 else 0)

    touched = count currently unique nodes in proposed
    return delta_U, touched, keys(changes)
{{< /research-algorithm >}}

The order matters: **combine the changes to a group before calculating its contribution to uniqueness.** Several nodes can leave or enter the same group in one deletion. Counting each proposed move separately against the original group size would give the wrong answer.

For the four-node table above, deleting *w–a* moves *w* from (3, 1) to (2, 0), *a* from (2, 1) to (1, 0), and *x* from (2, 1) to (2, 0). The two singleton groups disappear, so ΔU = −2.

The node *d* stays at (1, 0). It still stops being unique, because *a* joins its group. This distinction—local signature changes versus changes in group membership—also matters for caching.

## Reuse candidate scores, but track what they depend on

The next step was to avoid scoring every edge again after each deletion. A candidate’s score can stay valid for many iterations. We store it, record which signature groups it reads, and recalculate it when its inputs change.

This was part of the same optimization work as the incremental counters. The thesis explored candidate selection and caching variants; the refined FastTracking implementation brings those ideas together while preserving the reference greedy deletion sequence, including ties.

### A distant candidate can become stale

The obvious reason to rescore an edge is that its local graph changed. There is a second reason: a group count used by its preview changed.

Suppose a candidate would move a node into signature group *s*. If that group has one member, the arrival removes the existing member’s uniqueness. If it already has two members, the arrival does not help. A deletion elsewhere can change that count while leaving the candidate’s neighbourhood untouched.

We therefore keep two kinds of invalidation: edges incident to changed nodes, and candidates whose recorded signature dependencies include a changed group.

{{< research-algorithm number="04" title="Reuse exact scores" >}}
best = current deletion set
for each live edge:
    rescore(edge)  # preview, save dependencies, push priority

while deletions < budget and best.unique_nodes > 0:
    discard heap entries for deleted edges or old priorities
    edge = pop smallest valid priority
    changed_nodes, changed_states = commit_deletion(edge)
    keep current set if it improves best

    dirty = live edges incident to changed_nodes
    for each other live candidate:
        if dependencies[candidate] intersects changed_states:
            dirty.add(candidate)
    for candidate in dirty:
        rescore(candidate)
return best
{{< /research-algorithm >}}

A min-heap picks the smallest priority. Rescoring pushes a new entry; an old entry is discarded when it reaches the top and no longer matches the stored priority. Deleted edges are discarded too.

The implementation still checks candidate dependency lists for changed signature keys. It avoids their expensive *score calculations* when nothing relevant changed; it does not eliminate every scan. A deletion affecting a widely used group can still require many candidates to be rescored.

We also retain the best deletion set seen so far. The budget is a maximum, and later deletions do not necessarily improve uniqueness. Returning the best prefix avoids throwing away an earlier, better result.

On the final 17-network benchmark, FastTracking reproduces greedy’s choices with a **1,907× geometric-mean speedup**. Median solver time drops from 17.0 minutes to 0.447 seconds.

## Use the faster loop to explore better choices

Once evaluation was cheap enough, I could try more than one search strategy. The thesis explored approximate candidate evaluation, multiple starts, large neighbourhood search, beam search, and Monte Carlo tree search.

There were trade-offs. Shortlisting candidates could save time but miss useful edges. Broader search could find better deletion sets but cost more. The most useful direction was to put a small amount of problem knowledge into the edge score itself.

### Think of signatures as positions

An ego network is a node, its neighbours, and the connections between them. Its signature gives us coordinates: degree on one axis, triangle count on the other. Several nodes at the same position form a shared group; a position occupied by one node marks a unique node.

This picture suggests why immediate gain is not the whole story. A node can move once and remain unique, then join a shared group after another deletion. The thesis’s distance analysis also found that nodes closer to another occupied state were more often resolved on the benchmark.

{{< research-figure src="assets/ego-space.svg" mobile="assets/ego-space-mobile.svg" alt="An illustrative degree–triangle state space. Circles show occupied signatures and their group sizes. A unique node moves from (6,2) to the empty signature (5,1), staying unique, then joins three nodes at (4,1). Several other shared and singleton groups provide context." caption="Numbers are group sizes. The dashed position becomes occupied after the first move; the destination grows from three nodes to four after the second. This is an illustrative trajectory for one node, with other affected nodes omitted. ClassTargeted does not plan this path or choose a destination." >}}

### ClassTargeted: change more of the nodes that stand out

ClassTargeted adds a second term to the greedy score: how many currently unique nodes a candidate affects. It uses the same preview and cached search machinery. Only the priority changes.

{{< research-algorithm number="05" title="One search engine, two selection rules" >}}
delta_U, touched, dependencies = preview(edge)

# FastTracking: minimise the immediate change in uniqueness.
priority = (delta_U, 0, edge_id)

# ClassTargeted: maximise the weighted score.
score = -100 * delta_U + 4 * touched
priority = (-score, delta_U, edge_id)
{{< /research-algorithm >}}

Here, ΔU is the predicted change in unique nodes, so a reduction has a negative sign. The minus sign converts it to a positive reward. `touched` counts currently unique nodes among the endpoints and common neighbours, before deletion.

For example, two candidates might each remove one unique node immediately. If one affects one unique node, it scores 104. If the other affects three, it scores 112. ClassTargeted prefers the second, giving more unique nodes a chance to change signature.

This is a weighted sum. It does not guarantee that immediate reduction always outweighs the second term, and it does not calculate distance to a shared group. The state-space view supplied the motivation; the implementation uses a cheap count already available during the preview.

On the final benchmark, this increases mean uniqueness reduction from **73.5% to 83.5%**, with a median solver time of 0.438 seconds. It improves on greedy on 15 networks, ties on one, and does worse on one.

### CT-LNS: reopen part of the solution

ClassTargeted still builds a deletion set one edge at a time. Large neighbourhood search gives it a way to reconsider earlier choices: restore some deleted edges, then refill the available budget.

{{< research-algorithm number="06" title="Reconsider a deletion set" >}}
current = ClassTargeted(original_graph, budget)
best = current

repeat up to 16 times, stopping if best.unique_nodes == 0:
    candidate = copy of current
    restore a random 80% of candidate's deleted edges
    candidate = ClassTargeted(candidate, budget)

    if candidate has fewer unique nodes than best,
       or the same count with fewer deletions:
        best = candidate
    if candidate.unique_nodes <= current.unique_nodes:
        current = candidate
return best
{{< /research-algorithm >}}

Restoring 80% of the deletion set reopens a substantial part of the solution while preserving some choices. Accepting equally good replacements lets later rounds start from a different set without worsening the current uniqueness count.

The repair step uses the original total budget, including edges still deleted. It does not get another 5% allowance each round.

CT-LNS reaches a mean uniqueness reduction of **85.7%**. It improves on greedy on 16 of the 17 networks and ties on the remaining one. Its median solver time is 1.160 seconds, with a geometric-mean speedup of 356× over the reference.

These final results use 17 networks, a maximum 5% edge-deletion budget, and ten runs per method and dataset. Reduction is averaged across networks; speedup is the geometric mean of per-network runtime ratios. Solver timings include initialization and exclude graph loading.

## What I took from the project

The biggest speed gains came from retaining the right information. Arrays avoided repeated node calculations. Group counts avoided full-graph scans. Dependencies made score reuse exact.

That faster implementation also changed what I could investigate. I could compare more search methods, examine why greedy got stuck, and test whether a small, problem-specific change helped. ClassTargeted and CT-LNS came out of that process.

There is more to test: richer attacker knowledge, the effect of deletions on later analyses, larger networks, and parameters selected on separate datasets. Matching degree and triangle count answers the particular privacy model studied here.

The thesis records the broader exploration. The accepted paper condenses and refines the same project around its two main contributions: **an exact speedup, and better edge selection using the state we already maintain.**

You can inspect or build the code from the [paper code tag on GitHub](https://github.com/JorisAlkema/optianon/tree/paper/2026-fast-effective-search).

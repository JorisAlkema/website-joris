+++
title = "Making network anonymization practical"
date = 2026-10-08
author = "Joris D.C. Alkema"
tags = ["network science", "privacy", "algorithms", "optimization"]
description = "My MSc thesis and paper on making budgeted network anonymization faster and more effective."
draft = false
style = "research-article.css"
+++

{{< research-publication >}}

Social network data are valuable for research, but before such data can be shared it should not be possible to identify anyone in them, and removing names is not enough. Someone who knows only how many contacts a person has, and how many of those contacts know each other, can often single that person out. I call this pair of numbers the node's *signature*.

An existing method reduces this risk by deleting a limited number of edges (the *budget*), each time choosing the edge that leaves the fewest nodes with a unique signature. My MSc thesis made this method about 1,900 times faster without changing its output, and I then used the time saved to test other rules for choosing the next edge. The four figures below explain both contributions on a small example network of 20 nodes and 32 edges.

{{< research-anim scene="problem" script="assets/anon-anim.js" >}}
Figure 1: The anonymization problem. Nodes are labelled (degree, triangles); unique nodes are shown in red. *U* denotes the number of unique nodes.
{{< /research-anim >}}

The reference greedy algorithm scores every remaining edge before each deletion. The original implementation scored an edge by deleting it, recomputing the signatures of all nodes and undoing the deletion, and profiling showed that almost all running time was spent in this step. The score of an edge is ΔU, the change in the number of unique nodes *U* if that edge were deleted; negative values are good, so −2 means two fewer unique nodes. My first contribution, FastTracking, computes the same score from only the nodes that the edge affects, while keeping a count of how many nodes have each signature.

{{< research-anim scene="eval" script="assets/anon-anim.js" >}}
Figure 2: Scoring candidate edges. Both panels advance at the same rate per node. The reference (a) recounts every node for every candidate (lightly shaded). FastTracking (b) computes only the endpoints and their common neighbours (shaded and outlined), whose new signatures appear in bold italics.
{{< /research-anim >}}

The second part of the speed-up is to avoid scoring an edge again when its score cannot have changed. FastTracking stores each score and records which signature counts it relied on. After a deletion, it recomputes a score only if the edge touches a node that changed, or if one of the counts it relied on changed.

{{< research-anim scene="cache" script="assets/anon-anim.js" >}}
Figure 3: Reusing stored scores. The number on each edge is its stored score ΔU. Blue question marks indicate scores that have become invalid: dotted edges touch a changed node, and dash-dotted edges relied on a signature count that changed. In a graph this small, a large share of the scores becomes invalid at each step.
{{< /research-anim >}}

With scoring this cheap, it became practical to compare different rules for choosing the next edge. Ties are common: several edges often give the same reduction in *U*, and the greedy rule then simply takes the first one. The rule that worked best, ClassTargeted, adds a small bonus for each currently unique node that a deletion affects, so that among tied edges it prefers the one that changes unique nodes themselves, rather than one that only hides them by giving other nodes the same signature. In the experiments this rule reached a lower *U* than greedy within the same budget, as the final paragraph shows. ClassTargeted uses the same engine as FastTracking.

{{< research-anim scene="rule" script="assets/anon-anim.js" >}}
Figure 4: The greedy rule (a) and ClassTargeted (b) with the same budget of four deletions. Shaded nodes are changed by the chosen edge; unique nodes among them have a thick outline. In (a), the unique nodes that step 2 hides behind other nodes have a dashed outline. The grid below each graph shows how many nodes share each (degree, triangles) signature, and the arrows show where the changed nodes move. The two rules first differ in step 2, where two edges are tied, and ClassTargeted breaks another tie in step 3. In this example, the greedy rule stops at *U* = 2, whereas ClassTargeted reaches *U* = 0.
{{< /research-anim >}}

On a benchmark of 17 real networks with a deletion budget of 5% of the edges, FastTracking was on average about 1,900 times faster than the reference (geometric mean), reducing the median solver time from 17 minutes to 0.45 seconds while making exactly the same choices. ClassTargeted increased the mean reduction in unique nodes from 73.5% to 83.5% at a comparable running time. The implementation is available on [GitHub](https://github.com/JorisAlkema/optianon/tree/paper/2026-fast-effective-search). In my current position at Leiden University, I am extending this work to population-scale network data from Statistics Netherlands (CBS).

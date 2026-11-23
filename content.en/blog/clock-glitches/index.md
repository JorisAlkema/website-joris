+++
title = "When a clock glitch changes a neural network's answer"
date = 2024-08-21
author = "Joris D.C. Alkema"
tags = ["embedded systems", "security", "machine learning"]
description = "A short account of my BSc thesis on clock glitches, embedded neural networks, and the gap between simulated faults and hardware measurements."
draft = false
style = "research-article.css"
+++

A neural network on an embedded device, such as a camera that grants access when it recognises a face, gives the right answer only if the processor executes it correctly. An attacker with physical access can disturb that execution and change the answer without touching the model itself. One way to do this is a clock glitch: a brief disturbance of the clock signal that sets the processor's pace.

My BSc thesis examined how clock glitches affect a small classifier for handwritten digits (MNIST) running on the ARM processor of a [ChipWhisperer-Lite](https://chipwhisperer.readthedocs.io/en/latest/Capture/ChipWhisperer-Lite.html), a board made for this kind of experiment. The program raises a *trigger* signal when the computation of interest starts, and the ChipWhisperer inserts the glitch a chosen number of cycles later. I then asked whether the effect of a glitch could be reproduced in software by skipping a single instruction with GDB, a standard debugger. If it could, such faults could be studied without the hardware.

{{< research-anim scene="glitch" script="assets/glitch-anim.js" image="assets/mnist-zero.jpg" >}}
Figure 1: One hidden-layer computation in three phases: (1) normal execution, (2) a clock glitch on the hardware, and (3) two GDB replays that each skip one instruction. Red vertical marks show the measured output of phase (2). The assembly, cycle counts and scores are illustrative and are not the recorded measurements.
{{< /research-anim >}}

In the experiments, some glitches changed the output scores and a few changed the predicted digit, for example from 0 to 5. Reproducing these results in GDB proved difficult. A single line of C expands into many instructions, including library calls for floating-point arithmetic, several instructions take more than one cycle, and the processor overlaps the execution of consecutive instructions. The ChipWhisperer also adds its own delay between the trigger and the glitch. I could not determine which instruction a successful glitch had affected, and none of the single-instruction skips I tried reproduced the measured outputs. So I could not show that a clock glitch behaves like a single skipped instruction, and a simulation that assumes it does may miss part of what happens on real hardware.

{{< research-thesis degree="BSc" year="2024" university="Leiden University" title="Evaluating the robustness of neural networks in the presence of fault injection attacks: simulations versus measurements" url="https://theses.liacs.nl/pdf/2023-2024-AlkemaJDCJorisDuurtCornelis.pdf" supervisors="Nele Mentens and Nuša Zidarič" >}}

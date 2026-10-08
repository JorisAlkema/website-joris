+++
title = "When a clock glitch changes a neural network's answer"
date = 2024-08-21
author = "Joris D.C. Alkema"
tags = ["embedded systems", "security", "machine learning"]
description = "A short account of my BSc thesis on clock glitches, embedded neural networks, and the gap between simulated faults and hardware measurements."
draft = false
style = "research-article.css"
+++

A camera can use a neural network to recognise a face or detect an object. On an embedded device, that prediction depends on the processor running the model correctly. An attacker with access to the hardware could try to disturb that execution and change the answer. That matters when a system acts on the prediction, for example to grant access.

My BSc thesis investigated **clock glitches**: brief disturbances in the clock signal that controls the processor's timing. I wanted to see how they affected a neural network running on real hardware, and whether skipping instructions in a debugger could reproduce those effects.

{{< research-figure src="assets/clock-glitch.svg" alt="Two clock signals: regularly spaced pulses above, and the same signal with a brief additional pulse edge below. The disturbed interval is highlighted." caption="A clock glitch introduces a brief timing disturbance. This schematic shows one possible waveform, not a measurement from the experiment." >}}

Hardware experiments need specialised equipment and careful timing. If a software simulation could reproduce the same faults, it could make testing vulnerabilities cheaper and easier to repeat. The comparison was a way to check whether the simple instruction-skipping model actually represented the hardware behaviour.

I adapted an existing C implementation of a small neural network trained to recognise handwritten digits from MNIST, and ran it on the ARM microcontroller of a [ChipWhisperer-Lite](https://chipwhisperer.readthedocs.io/en/latest/Capture/ChipWhisperer-Lite.html). Its capture board generates the clock glitches; the target board runs the model.

{{< research-figure src="assets/chipwhisperer-lite.png" alt="A ChipWhisperer-Lite with its larger capture board on the left and its ARM target board on the right, both labelled." caption="The capture board controls the experiment; the ARM target runs the neural network. Photo from [Rădulescu and Choudary (2022)](https://www.mdpi.com/2410-387X/6/3/31), also used in the thesis." >}}

I added triggers around the hidden-layer calculations and swept the glitch timing and width. Some glitches changed the output scores; a few changed the predicted digit. In one test, an image of a zero was classified as a five.

{{< research-fault-example >}}

The harder part was explaining what happened inside the processor. I used GDB to step through the assembly instructions and read the processor's cycle counter. Starting at the trigger, I tried to match the delay of a successful glitch to the instruction running at that moment. I then advanced past selected instructions and compared the resulting values with the hardware measurements. The assumption was that a clock glitch could be modelled as skipping an instruction.

That timing was difficult to pin down. One line of C expands into many instructions, including library routines for floating-point arithmetic. Some instructions take multiple clock cycles, so a glitch can land partway through one. The processor also overlaps stages of instruction execution in a pipeline, which complicates the timing further. ChipWhisperer adds a delay between receiving the trigger and issuing the glitch. **Skipping instructions in GDB did not reproduce the measured results**, and I could not verify exactly which instructions the glitches affected.

The project produced a working setup for injecting faults and inspecting their effects on the network. The mismatch suggests that treating a clock glitch as a clean instruction skip may miss what the processor actually does.

{{< research-thesis degree="BSc" year="2024" university="Leiden University" title="Evaluating the robustness of neural networks in the presence of fault injection attacks: simulations versus measurements" url="https://theses.liacs.nl/pdf/2023-2024-AlkemaJDCJorisDuurtCornelis.pdf" supervisors="Nele Mentens and Nuša Zidarič" >}}

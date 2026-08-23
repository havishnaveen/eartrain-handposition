# Project Context: EarTrain (Auxiliary Tool for reading.oclef.com)

## Core Purpose
This application serves as a strictly guided, auxiliary drill tool for users of `reading.oclef.com`. When the main sightreading application detects that a student is struggling with keyboard geography and hand positioning, they are redirected here. The goal is to rapidly and effectively correct their hand positioning through targeted lessons, and then send them back. 

## The Target Audience & Stakeholder Needs
*   **Target Audience:** Young piano students.
*   **Parent/Stakeholder Perspective:** The application must look and feel like serious educational work, not a game. Visual distractions, interactive "toys", and badges give the impression that the child is just playing around. 
*   **Instructor Perspective:** Data must be rigorously tracked. Instructors need detailed telemetry on where students are failing so they can identify weak spots in hand positioning.

## Architectural Mandates
1.  **Acoustic Piano Recognition:** The user must play their actual, physical piano. The app will use microphone input (Web Audio API / pitch recognition) to listen to what the user plays and validate it against the exercise requirements.
2.  **Highly Focused, Clean UI:** The interface must be heavily streamlined to remove unnecessary distractions. While it doesn't need to be an ugly wireframe, it must look highly professional and focused. Remove playful visual toys, unnecessary animations, and game-like elements.
3.  **Single-Track Pathway (Zero Choice Fatigue):** The user has a very clear, strictly guided path. There should be no complex menus to get lost in and no branching paths. The application provides exactly what to do next with absolute clarity.
4.  **Auto-Advancing:** When a lesson or exercise is successfully completed, a 5-second countdown timer automatically transitions the user to the next step. They do not get to linger, collect badges, or explore. The app just keeps chugging along.

## Role Division (Claude vs. Antigravity)
*   **Claude:** Responsible for heavy algorithmic code implementation. This includes microphone audio capture, DSP/pitch recognition algorithms, data tracking logic, and the core state machine for the single-track pathway.
*   **Antigravity (Gemini):** Responsible for repository management, routing, wireframe React UI scaffolding, dependency management, and integrating Claude's algorithms into the application framework.

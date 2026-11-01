# Standing Project Rules

1. Walls are drawn as thin single lines (about 1.5 px, light gray, subtle glow, round joins), never as boxes with a fill or outline. This is done once in the shared renderer so every track gets it automatically. Physics walls stay thin solids or chain shapes, and the drawn line matches the collision centerline.

2. The real track is the channel bounded by gray polyline walls inside the arena. Space outside is dead area, and the channel is sealed so marbles cannot leave it.

3. No race-duration target. Do not tune tracks to a finish time. HARD_RACE_LIMIT_S stays at 120 s or higher as a backstop only.

4. Every passage is at least 2.2D wide. Start channel is 12 units wide and 24 units tall for 20 marbles. Exit at least 5.5 wide.

5. Spinners exist only on Ironhallow and Ashenmoor. They rotate in place, are deterministic from simulation time, and reset with the race. Swept-circle gaps (spinner to spinner and spinner to wall) must be at most 0.3 or at least 1.5D.

6. Tests must fail if a track's defining obstacles are removed, so renamed copies or plain ramps cannot pass.

7. Never claim a test passed unless it was run. Report real results. Commit after each step.

8. Reference layouts live in reference/*-spec.md. OpenCode cannot view images, so the spec files are the source of truth.

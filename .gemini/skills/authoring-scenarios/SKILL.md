---
name: authoring-scenarios
description: 'Use when events, clocks, state changes, simulators, management loops, routes, or endings carry the experience. Primary skill for scenario systems; hand character psychology to authoring-characters and setting substance to authoring-worlds. Do not use when a single relationship arc or static world description is the main task.'
tags: ['authoring', 'scenario', 'events', 'simulation']
related_tools: ['inspect_document', 'read_content', 'analyze_content']
---

# Scenario & Event Authoring

## Outcome

Create a repeatable scene engine in which time, state, pressure, and player choice change what can happen next.

## Minimal workflow

1. Define the core loop as action → response → state change → new opportunity. If removing event machinery leaves the same experience, use a character or world Skill instead.
2. Choose the clock: turns, scenes, days, locations, milestones, resource thresholds, or mixed time. State exactly what advances it.
3. Build event banks by function: routine, opportunity, conflict, consequence, recovery, revelation, and rare disruption. Vary participants, location, cost, and emotional temperature.
4. Couple events to explicit state. Define prerequisites, weights or priority, cooldowns, exclusions, mutations, and recovery paths. Avoid purely random events that ignore prior choices.
5. Design rhythm across setup, pressure, release, and residue. Aftermath should create future hooks rather than resetting the simulator.
6. For fixed narratives, plan routes and endings explicitly. For emergent RP, encode thresholds and possibilities without guaranteeing outcomes.
7. Open inside the loop: show current state, immediate pressure, actionable options, and enough uncertainty for `{{user}}` to choose.

Use dedicated trigger, Lua, CBS, or lorebook Skills only after the scenario logic is settled. Those Skills implement the system; they do not decide its dramatic rhythm.

## Validation

Run representative paths: common action, ignored hook, failed check, repeated action, boundary value, recovery, and late-state event. Check that state changes are legible, events do not fire without prerequisites, repetition degrades gracefully, choices matter, and no route scripts the user's internal response.

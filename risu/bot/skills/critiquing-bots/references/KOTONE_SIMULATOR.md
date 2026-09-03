# Kotone Profile: Cast-less World Simulator

Critique a simulator whose written assets are a world prompt, lorebook, narrator specification, and first message, treated as the architectural blueprint of a generative possibility space from which every future session will be produced. The shared persona, stance, method, rating scale, and output skeleton are in `SKILL.md`.

## Toolkit for this shape

- Walter Benjamin's flâneur reimagined as the explorer of virtual space
- Worldbuilding theory — Mark J.P. Wolf's triad of completeness, consistency, and invention from "Imaginary Worlds"; Tolkien's "secondary belief" (the inner consistency of reality) as the classical standard for coherence
- Subculture narrative theory — Eiji Ōtsuka's theory of narrative consumption (users consuming fragments to access the "grand narrative" of a world — a theory this medium literally implements), Hiroki Azuma's database model
- Game and TTRPG theory — Jesper Juul's rules/fiction duality, Janet Murray's procedural authorship, and the accumulated craft of tabletop GM theory (e.g., PbtA's "play to find out" principle, fronts and threats, the GM's duty to say "no" in service of the fiction)

## Framing

Kotone may treat the simulated world as a macroscopic, living persona where the metaphor illuminates, but she guards against letting this metaphor regress into character criticism (psychology, inner conflict, narrative arc). A simulator is not a personality; it is a rule-set and a possibility space. The primary question is never "what is this world like?" but "what does this world permit, refuse, and make consequential?"

## Axes of critique

### 1. The Narrator's Voice

With no main character, the narrator IS the face of the world — the entity the user meets every single turn.

- **Voice specification**: Does the prompt define HOW the world is narrated — camera distance (omniscient sweep vs. close third), tense, sentence rhythm, the temperature of its cruelty or humor — or only WHAT the world contains? An unspecified narrator collapses into the model's default tone, and with it collapses the entire category of "atmosphere."
- **The crowd problem**: No protagonist means many NPCs. Does the design give NPCs the specification needed to speak in distinguishable voices (regional diction, class registers, faction rhetoric), or will every inhabitant speak in the same model-default voice? This single factor most directly determines whether the world feels alive or like a diorama of mannequins.

### 2. Constraint Design — Can This World Say "No"?

The philosophical tension of agency vs. determinism, brought down to mechanism. LLMs are compliant by default; a world without engineered constraints degenerates into a world where everything the user attempts succeeds — a world incapable of drama.

- **Costs and limits**: Are the world's systems of power defined with prices and ceilings (magic with a cost, status with walls, scarcity that binds)? Cite where, or note their absence.
- **Consequence rules**: Are the consequences of user action specified as rules, or left entirely to model discretion? Discretionary consequence is no consequence.
- **The grammar of refusal**: Does the prompt teach the narrator how to refuse — how to make failure interesting, how to oppose the user in service of the fiction, as a good GM does? "Play to find out" requires a world that pushes back.

### 3. Lorebook & Information Architecture

- **Layering**: Is the division between the always-present world prompt and the conditionally-injected lorebook principled? Is foundational physics buried in a rarely-triggered entry, or trivia bloating the permanent context?
- **Activation design**: Will trigger keys fire when their content is needed? Identify entries that will rarely activate, and keys so broad they will pollute unrelated scenes.
- **Entry craftsmanship**: Does each entry read as injectable context (concise, declarative, model-facing) or as worldbuilding prose written for a human reader? The latter is a category error.
- **Coherence (Wolf/Tolkien)**: Do the entries form a world with inner consistency, or do they contradict one another or the world prompt? Cite specific conflicts.
- **Playable depth vs. inert encyclopedism**: Does the lore add things the user can discover, exploit, and collide with — or lore that exists but can never meaningfully surface in a session?
- **Negative space**: Name the two or three highest-value missing entries — the absent lore that would most enlarge the possibility space.

### 4. State Management — the Simulator's Durability

A character card's durability is persona retention; a simulator's durability is state consistency.

- Does the design include structure for tracking world state — time, location, inventory, NPC memory, the changes the user has inflicted on the world (status windows, end-of-turn formats, summary rules)?
- If a tracking format exists, critique its craftsmanship: are the tracked variables the ones that matter dramatically? Is the token cost proportional to the utility?
- If none exists, forecast the consequence: at what point does this world become an amnesiac space where the village the user burned stands rebuilt?

### 5. Cold Start — the Design of Entry

A character bot's first message is self-evidently "meeting the character"; a simulator's is not.

- Does the first message establish where the user is, who they may be, and what they can do — does it teach the grammar of the world and offer affordances (visible hooks, pressures, open doors)?
- Or is it an encyclopedia dump, or a landscape painting with no handles? The first message is the simulator's tutorial, thesis statement, and invitation at once; judge it as all three.

### 6. Emergent Potential & Predicted Session Durability

From the static text alone, forecast the system's generative behavior:

- **Emergent narrative**: Do the world's rules and factions collide in ways that can produce stories the author did not script? Identify the specific rule-intersections with the highest emergent yield — and the systems that are merely decorative.
- **Response range**: How does the world handle divergent user approaches — the conqueror, the merchant, the tourist, the saboteur, the romantic? Where is the range widest, and where does the simulation thin out?
- **Point of collapse**: Name the single user behavior most likely to break the simulation, and which textual weakness permits it.

## Output deltas

- Title: a critical title about the World Simulator by Kotone.
- Section 1 follows the six axes above.
- Section 2 names what to cut, what to rewrite, which lorebook entries to add, merge, or re-key, and what constraint or state structure to introduce.
- Section 3 is labeled **Where it lives / where it breaks**: the session type or user playstyle in which the world is most alive, and the single user behavior most likely to shatter the simulation.
- Rating scale noun: "simulator"; the ★5 anchor is a world that expands what the medium can do. Good points cover world-building, mechanics, and atmosphere. The one-liner symbolizes this Simulated World.

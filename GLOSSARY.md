# Workbench UI exploration

A small workspace for trying visual design, interactions, and motion.

## Language

**Workbench shell**:
The persistent frame around the active page: navigation, header, open tabs, chat placement, and status bar placement. It includes the desktop rail and phone drawer arrangements.

**Skin**:
A visual identity shared across the workspace, including colors, typography, spacing, borders, and motion timing. Atlaswork has one skin, warm editorial; themes and modes vary it.

**Theme**:
A palette the person picks in Settings → Appearance (Garden, Linen, Tide, Terracotta, Dusk, Frost, Meadow, Midnight, Espresso): surfaces, ink, accent and the kind colours, a title face and corner size, and its own background pattern, sidebar and chat rail. In code it is `Session.palette` and `data-palette`.
_Avoid_: look, preset

**Mode**:
Light, dark, or Auto (following the device). Every theme comes in both. In code it is `Session.theme` and `data-theme`, named before themes existed.
_Avoid_: theme (for light or dark)

**Workspace**:
The person's own records: domains, projects, resources, tasks, topics, agents, and chat threads. It is the part that could come from somewhere other than this device.
_Avoid_: data (too broad), mock data (the demo is one source of a workspace, not the workspace itself)

**Domain**:
An ongoing part of life, such as Health or Family, in the PARA sense of an Area. Every project and task belongs to exactly one domain. The first domain is the default and cannot be removed.
_Avoid_: area (older name, still the field on projects), category

**Resource**:
Anything kept for use: a note, link, file, image, video, or quote, with your own words about it. It has one home (a domain, a project, or a topic) and can be linked into other projects. A note is one kind of resource.
_Avoid_: item, material, attachment

**Topic**:
A subject you keep resources on, outside any domain or project, in the PARA sense of a Resource folder. Topics live in the Library. A finished project's keepers move into topics.
_Avoid_: tag, folder, category

**Person**:
Someone in the person's life, kept as a Topic with a face, who they are to them, the domain whose agents read about them, and dates that come round each year. An @Name in a note, task, project or chat mentions them; their page in the Library gathers those mentions, their memories and what is kept about them.
_Avoid_: contact (no phone or address book), user (the one who owns the workspace)

**Link**:
A resource shown in a project that isn't its home. Unlinking removes it from that project only.

**Linked folder**:
A folder on this computer that a project points to, so its agents can read the text files in it. It belongs to the device, not the workspace: other devices and backups don't have it, and the files stay where they are.
_Avoid_: attachment, synced folder

**Place**:
A domain, a project, or a topic: somewhere you can be and somewhere things can be put.
_Avoid_: location, spot

**Home**:
The place a resource or task belongs: a domain directly, or a project, which brings its domain along. A resource can also be homed in a topic; a task cannot. Moving something changes its home; a link does not.
_Avoid_: location

**Page**:
What a domain's overview or a project shows, top to bottom. Today is arranged too, but it belongs to the Session, keeps nothing put away, and is not called a page.

**Widget**:
A kind of thing a page can show: tasks, projects and resources read records; a countdown, tracker, habit, goal or pinned note keeps its own data.
_Avoid_: card, panel

**Block**:
One widget placed on a page, with how it draws, how wide it is, and anything it logged.

**Put away**:
Taken off a page with what it logged kept, until restored or deleted for good. Only blocks that keep their own data are put away; the others simply go.
_Avoid_: hidden, removed

**Pace**:
How a project stands against its clock: steps done against time gone since its finish line, a dated countdown with a start on its page, was set. Behind when the clock is clearly ahead of the work.
_Avoid_: progress (the count alone), velocity

**Agent**:
Someone you can talk to and who can act for you, either simulated or linked to a real worker. Atlas cannot be deleted; Workbench supplies him with all scoped context and others with their assignments, while a linked worker's outside powers remain separate.
_Avoid_: bot, assistant (Atlas's role, not the kind)

**Agent's Workspace**:
The part of a person's Workspace an Agent may read or propose changes to, according to its assignments and tools.
An explicitly attached Resource can extend that reach while attached, but archived records and archived Homes stay out.

**Proposal**:
A change to the Workspace that an agent drafts: new tasks, or review changes such as completing, rescheduling, archiving or arranging a page. It waits for Apply unless the agent's write mode applies it with Undo.

**Handoff**:
Something an agent prepares for the person to open themselves: a mail draft, a calendar file, or a search. Nothing leaves on its own.

**Memory**:
One short sentence an agent kept from what the person said, about a place, about the person, or about a Person. It belongs to the place (or the Person), so whoever is assigned there reads it; it shows under the reply with Undo and in the agent's Briefing with Forget.
_Avoid_: note (a Resource you write), history (the Thread's messages)

**Team**:
A saved group of agents around a kind of work. Its first member leads. A team can work on many projects and has its own room.

**Crew**:
Everyone on a project, in reply order: its assigned agent, its team (lead first), then the domain's agent, who joins every crew in its domain.

**Thread**:
The chat with one agent or a room: called a chat in the app. It keeps the messages, the note attached for context, and how far the person has read.

**Conversation**:
One fresh stretch of a chat, beginning on a new local day or when you choose New conversation, which also clears the chat on screen. Earlier conversations stay in the Logbook; a fresh one does not erase what agents remember.
In code it is a chat session (`Thread.sessionStarts`, `sessionStartOf`, `Sitting`), unrelated to the device Session below.
_Avoid_: session (in the app's words)

**Room**:
A shared thread with two or more agents: a project's crew, a team, or agents you picked. `@name` addresses someone; otherwise the first member answers.

**Nearest owner**:
Who chat opens to in a place: the project's room, else its one crew member, else the domain's agent, else Atlas.

**Picked chat**:
A Thread you chose to keep on screen while you stay in the same Domain and Project; a Resource tab counts as its home Project. Elsewhere chat opens to the Nearest owner.

**Routine**:
Something an agent does on its own on a schedule: a check-in, a status report, a review, or a weekly improvement. An agent, a domain, or a project owns it. It runs once its time has passed, in the open app or, while you're away, on the server, and a missed stretch runs once.

**Run**:
One time a Routine came due and what came of it: it posted something, its runner had nothing to say, it ended before asking because nothing changed since the last run, or it failed with a reason.
_Avoid_: job, execution

**Session**:
How this device presents the workspace: open tabs and the last section per domain, the selected domain, the Topic open in the Library, layout, appearance, and the chat draft. It never travels with the workspace.
_Avoid_: settings (only part of it), state

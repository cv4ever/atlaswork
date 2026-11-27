// The first morning (agents-design D35): starter projects Atlas offers per domain, and `buildStarter`, which creates
// one with its arranged page (D32 blocks) and first tasks in one changeset. One answer from the person fills the block
// that makes the page theirs (a date, a target, a name). FirstMorning.tsx draws the flow; a domain page's ideas
// (`ideasFor`, agents-design D62) open the project dialog filled from one.
import { defaultPages, shownBlocks } from "./blocks.ts";
import type { Project, WorkspaceData } from "./model.ts";
import type { ProjectColour } from "./look.ts";
import type { Block } from "./blocks.ts";
import { createProject, createTask } from "./workspace.ts";
import type { Change } from "./workspace.ts";

/** A block before it has an id. Milestones may carry a `plan`: steps placed at fractions of the way to the finish date. */
export type StarterBlock = Omit<Block, "id"> & { plan?: { title: string; at: number }[] };
export type StarterAsk = {
  prompt: string;
  kind: "date" | "number" | "text";
  placeholder?: string;
  /** Which block the answer fills (index into `blocks`): a countdown's date or a tracker's or goal's target. A `title` answer names the project after the template ("Title: answer"). */
  block: number;
  field: "date" | "target" | "title";
};
export type StarterProject = {
  title: string;
  line: string;
  color: ProjectColour;
  /** The agent's own tip in the project's welcome (agents-design D40): one concrete thing that makes this kind of project work. */
  tip: string;
  blocks: StarterBlock[];
  tasks: string[];
  ask?: StarterAsk;
};

/** Every page: the finish line and the one thing to do now on top, the first steps and what's kept at the bottom. */
const next: StarterBlock = { type: "tasks", view: "next", title: "Next up", width: "wide" };
const tasks: StarterBlock = { type: "tasks", width: "wide" };
const kept: StarterBlock = { type: "resources", view: "recent", width: "narrow" };
const countdown = (title: string): StarterBlock => ({ type: "countdown", title, width: "narrow" });
const tracker = (title: string, unit: string, better: "up" | "down" = "up", view = "latest"): StarterBlock => ({ type: "tracker", title, unit, better, view, width: "half", entries: [] });
const habit = (title: string): StarterBlock => ({ type: "habit", title, width: "half", days: [] });
const goal = (title: string, unit: string): StarterBlock => ({ type: "goal", title, unit, current: 0, width: "half" });
const checklist = (title: string, ...items: string[]): StarterBlock => ({ type: "checklist", title, width: "half", items: items.map((text) => ({ text, done: false })) });
const milestones = (title: string, ...plan: [string, number][]): StarterBlock => ({ type: "milestones", title, width: "half", steps: [], plan: plan.map(([step, at]) => ({ title: step, at })) });
const ask = (prompt: string, kind: StarterAsk["kind"], block: number, field: StarterAsk["field"], placeholder?: string): StarterAsk => ({ prompt, kind, block, field, placeholder });

/** The default question: every project has a finish line. A countdown at block 0 counts to it. */
const doneBy = ask("When do you want this done by?", "date", 0, "date");
const finish = countdown("Done by");
const when = (prompt: string) => ask(prompt, "date", 0, "date");

/**
 * Two to four per domain the first-run flow offers, plus Everyday. PARA shapes them: each is an outcome with a
 * deadline and first steps, not an ongoing habit (habits and trackers belong to the domain page). A habit or tracker
 * appears only where it serves the outcome (training for a race, a 30-day challenge). Lists of named things are
 * checklists (the definition of done); dated paths are milestones, dated from today to the finish line.
 */
export const starterProjects: Record<string, StarterProject[]> = {
  Everyday: [
    { title: "Paperwork in one place", line: "IDs, insurance, contracts and passwords, found in under a minute.", color: "pine", tip: "Quickest win: put your ID and insurance numbers in the password manager today.",
      blocks: [finish, next, checklist("Documents", "ID card and passport", "Insurance policies", "Rental or mortgage contract", "Tax records", "Passwords in a manager", "Medical records"), tasks, kept],
      tasks: ["List every document you've hunted for this year", "Pick one folder (paper or digital) and name its sections", "Scan or file the first stack"], ask: doneBy },
    { title: "Host a celebration", line: "A birthday, a dinner, a party: the day planned, the people there.", color: "ochre", tip: "Send the date before the menu. People plan around the date.",
      blocks: [countdown("The day"), next, checklist("Before the day", "Guest list", "Invitations sent", "Food planned", "Drinks sorted", "Music and decoration"), tasks, kept],
      tasks: ["Pick the date and the guest list", "Send the invitations", "Plan the food and what you need to buy"], ask: when("When is it?") },
  ],
  Health: [
    { title: "Annual check-ups done", line: "Dentist, blood work, eyes: all booked and behind you.", color: "clay", tip: "Book the dentist first. It usually has the longest wait.",
      blocks: [finish, next, checklist("Check-ups", "Dentist", "Blood work", "Eyes", "GP"), tasks, kept],
      tasks: ["List the check-ups due this year", "Book the dentist", "Book the blood work"], ask: doneBy },
    { title: "Fix my sleep in 30 days", line: "Seven hours on weeknights, two weeks running, by the end of the month.", color: "pine", tip: "Log tonight's hours, even if it's a bad night. The tracker needs a starting point.",
      blocks: [finish, next, tracker("Hours slept", "h"), habit("Lights out on time"), tasks, kept],
      tasks: ["Set a wind-down alarm 30 minutes before bed", "Charge the phone outside the bedroom", "Log tonight's hours"], ask: ask("How many hours a night are you aiming for?", "number", 2, "target", "7.5") },
    { title: "Reach my target weight", line: "A number, a date, and the weekly habits that get there.", color: "sage", tip: "Weigh in at the same time each morning, before breakfast, so the numbers compare.",
      blocks: [finish, next, tracker("Weight", "kg", "down", "slider"), habit("Moved today"), tasks, kept],
      tasks: ["Weigh in and log the starting point", "Choose the one meal to change first", "Book three movement sessions this week"], ask: ask("What weight are you aiming for?", "number", 2, "target", "75") },
  ],
  Family: [
    { title: "Plan the family trip", line: "Dates agreed, places booked, everyone looking forward to it.", color: "ochre", tip: "Agree the dates before anyone looks at places. Dates are the hard part.",
      blocks: [countdown("Departure"), next, milestones("The plan", ["Dates agreed", 0.1], ["Place chosen", 0.3], ["Travel and beds booked", 0.5], ["Packing list done", 0.9]), goal("Trip fund", "€"), tasks, kept],
      tasks: ["Agree on dates with everyone", "Shortlist three places", "Book where you'll stay"], ask: when("When would you leave?") },
    { title: "Make the family photo book", line: "The best photos printed and in their hands.", color: "clay", tip: "Pick from one year only. Fifty photos is plenty for a first book.",
      blocks: [finish, next, checklist("Steps", "Photos gathered in one folder", "Fifty picked", "Printing service chosen", "Pages laid out", "Ordered"), tasks, kept],
      tasks: ["Gather the photos into one folder", "Pick the fifty that tell the story", "Choose a printing service and lay out the first pages"], ask: doneBy },
    { title: "Organise the next birthday", line: "Gift, cake and people sorted well before the day.", color: "sage", tip: "Order the gift this week. Delivery is what usually runs late.",
      blocks: [countdown("The birthday"), next, checklist("Sorted", "Gift chosen", "Gift ordered", "People invited", "Cake or table booked"), tasks, kept],
      tasks: ["Decide on the gift", "Invite the people who matter", "Order the cake or book the table"], ask: when("When is it?") },
  ],
  Finance: [
    { title: "Build a three-month emergency fund", line: "Enough set aside to cover three months, in its own account.", color: "pine", tip: "Set the transfer for payday. Saving what's left at the end of the month rarely works.",
      blocks: [finish, next, goal("Emergency fund", "€"), tasks, kept],
      tasks: ["Work out three months of essentials", "Open a separate savings account", "Set up a transfer on payday"], ask: ask("How much is the fund when it's done?", "number", 2, "target", "6000") },
    { title: "Pay off the credit card", line: "Balance at zero, watched shrink every month.", color: "clay", tip: "Log the balance after every payment. Watching it shrink keeps you going.",
      blocks: [finish, next, tracker("Balance left", "€", "down", "slider"), tasks, kept],
      tasks: ["Write down the balance and the interest rate", "Choose a monthly payment you can hold", "Log the balance after each payment"], ask: ask("What's the balance today?", "number", 2, "target", "2400") },
    { title: "File the tax return", line: "Submitted before the deadline, with every receipt found.", color: "ochre", tip: "Start one folder for receipts today and drop everything in, sorted or not.",
      blocks: [countdown("Deadline"), next, checklist("Documents", "Income statements", "Receipts and invoices", "Deductions listed", "Bank interest statements", "Submitted"), tasks, kept],
      tasks: ["List the documents you need", "Gather last year's receipts and statements", "Book an afternoon to fill it in"], ask: when("When is the deadline?") },
  ],
  Career: [
    { title: "Land the next role", line: "An offer in hand, for the role you actually want.", color: "pine", tip: "Tell two people what you want next this week. Most roles come through someone.",
      blocks: [finish, next, checklist("Ready to apply", "CV updated", "Profile updated", "Portfolio or examples ready", "Two people messaged"), goal("Applications sent", "applications"), tasks, kept],
      tasks: ["Write the one-line version of what you want next", "Update the CV and the profile", "Message two people who'd know of openings"], ask: ask("What role are you going for?", "text", 0, "title", "Lead designer") },
    { title: "Get the certification", line: "Exam passed, certificate on the profile.", color: "sage", tip: "Book the exam first. A fixed date makes the weekly modules real.",
      blocks: [countdown("Exam day"), next, milestones("The path", ["Registered", 0.1], ["Half the modules done", 0.5], ["Practice exam", 0.8], ["Exam", 1]), goal("Modules done", "modules"), tasks, kept],
      tasks: ["Register for the exam", "Split the syllabus into weekly modules", "Do the first module"], ask: when("When is the exam?") },
    { title: "Prepare the performance review", line: "The year's wins written down, the case for what you want made.", color: "ochre", tip: "Write wins down as they happen. Nobody remembers March in December.",
      blocks: [countdown("Review"), next, checklist("Prepared", "Wins file started", "Numbers behind the wins gathered", "Feedback from a colleague", "The case drafted"), tasks, kept],
      tasks: ["Start a wins file and add three", "Ask one colleague for feedback", "Draft the case for the raise or the role"], ask: when("When is the review?") },
  ],
  Business: [
    { title: "First three paying customers", line: "Real people who paid for the offer.", color: "ochre", tip: "Message people one by one. Five real conversations beat one public post.",
      blocks: [finish, next, goal("Paying customers", "customers"), checklist("Ready to sell", "Offer in two sentences", "Price decided", "A way to pay", "Twenty people listed"), tasks, kept],
      tasks: ["Write the offer in two sentences", "List twenty people who might want it", "Send the first five messages"], ask: ask("How many customers would make this real?", "number", 2, "target", "3") },
    { title: "Launch the offer", line: "The day it goes out, and everything that must be true before.", color: "clay", tip: "Tell three people the launch date now. Saying it out loud makes it hold.",
      blocks: [countdown("Launch day"), next, milestones("The run-up", ["Offer written", 0.15], ["Page or listing live", 0.5], ["Three people told the date", 0.7], ["Launch", 1]), tasks, kept],
      tasks: ["Write what 'launched' means", "List what must be ready the day before", "Tell three people the date"], ask: when("When do you launch?") },
    { title: "Set up the books", line: "Invoicing, expenses and taxes handled in an hour a month.", color: "pine", tip: "Open the separate business account first. Everything else gets easier after.",
      blocks: [finish, next, checklist("In place", "Invoicing tool chosen", "Business account opened", "Expense categories set", "Monthly numbers hour booked", "Accountant or tax dates known"), tasks, kept],
      tasks: ["Choose the invoicing tool", "Open a separate business account", "Book a monthly numbers hour"], ask: doneBy },
    { title: "First €1,000 month", line: "Revenue you can point at, grown month by month.", color: "sage", tip: "Log last month's revenue, however small. You need the starting line.",
      blocks: [finish, next, tracker("Monthly revenue", "€", "up", "picks"), tasks, kept],
      tasks: ["Log last month's revenue", "Pick the one offer to push this month", "Decide the weekly number that gets you there"], ask: ask("What monthly revenue makes it real?", "number", 2, "target", "1000") },
  ],
  Home: [
    { title: "Finish one room", line: "The room you sigh at, done and photographed.", color: "sage", tip: "Photograph the room as it is today. The before picture is half the joy of the after.",
      blocks: [finish, next, checklist("Done means", "'Finished' written down", "Measured", "Shopping list made", "Room cleared", "Built, painted or placed", "Photographed"), tasks, kept],
      tasks: ["Decide what finished looks like", "Measure and list what to buy", "Clear the room first"], ask: ask("Which room?", "text", 0, "title", "Bedroom") },
    { title: "Clear the repair list", line: "Every small fix in the house done, one Saturday at a time.", color: "clay", tip: "Fix the most annoying thing first, not the biggest. Momentum matters more.",
      blocks: [finish, next, checklist("Repairs"), tasks, kept],
      tasks: ["Walk through every room and list what's broken", "Buy what the first fix needs", "Fix the most annoying one first"], ask: doneBy },
    { title: "Move house", line: "Keys in hand, boxes unpacked, utilities switched.", color: "pine", tip: "Give notice and book the movers this week. Both fill up fast.",
      blocks: [countdown("Moving day"), next, milestones("The move", ["Notice given", 0.1], ["Movers booked", 0.3], ["Address changes sent", 0.7], ["Utilities switched", 0.9], ["Moving day", 1]), { type: "tasks", view: "when", width: "half" }, { ...kept, width: "full" }],
      tasks: ["Book the movers or the van", "Give notice on the current place", "Switch electricity, water and internet"], ask: when("When is moving day?") },
  ],
  Learning: [
    { title: "Finish the course", line: "Every lesson done, the certificate earned.", color: "sage", tip: "Two short sessions a week beat one long one. Put them in your calendar.",
      blocks: [finish, next, goal("Lessons done", "lessons"), tasks, kept],
      tasks: ["Count the lessons left", "Block two sessions this week", "Do lesson one"], ask: ask("How many lessons are there?", "number", 2, "target", "24") },
    { title: "Pass the language exam", line: "The level you want, certified.", color: "pine", tip: "Take a practice test now, cold. It shows where the hours should go.",
      blocks: [countdown("Exam day"), next, milestones("The path", ["Registered", 0.1], ["First practice test", 0.3], ["Mock exam under time", 0.8], ["Exam", 1]), tracker("Hours this week", "h"), tasks, kept],
      tasks: ["Register for the exam", "Find a tutor or a course", "Do the first practice test to see where you stand"], ask: when("When is the exam?") },
  ],
  Creative: [
    { title: "Finish the big piece", line: "The project you keep thinking about, finished and shown.", color: "clay", tip: "Describe the finished thing in three lines. Every step after points at it.",
      blocks: [countdown("Show it by"), next, milestones("The making", ["Outline done", 0.2], ["First full draft", 0.5], ["Feedback from two people", 0.75], ["Final version", 0.95], ["Shown", 1]), tasks, kept],
      tasks: ["Describe the finished thing in three lines", "List the first five steps", "Do the first one"], ask: ask("What is it?", "text", 0, "title", "The short film") },
    { title: "Publish a collection", line: "Ten finished pieces, together, out in the world.", color: "ochre", tip: "Finish one piece before starting the next. Ten starts are not a collection.",
      blocks: [finish, next, goal("Finished pieces", "pieces"), tasks, kept],
      tasks: ["Choose the theme and the format", "Finish the first piece this week", "Decide where it will live"], ask: ask("How many pieces?", "number", 2, "target", "10") },
    { title: "Publish the first 10 videos", line: "Ten videos out, a publishing day that holds.", color: "pine", tip: "Pick a publishing day you can keep for ten weeks, then protect it.",
      blocks: [finish, next, goal("Videos published", "videos"), habit("Worked on the channel"), tasks, kept],
      tasks: ["Write ten titles you'd click on", "Pick the publishing day", "Script and shoot the first one"], ask: ask("How many videos?", "number", 2, "target", "10") },
    { title: "Reach 1,000 subscribers", line: "The first real audience, counted every week.", color: "sage", tip: "Log the count every Monday. Weekly numbers show the trend, daily ones only noise.",
      blocks: [finish, next, tracker("Subscribers", "subscribers", "up", "picks"), tasks, kept],
      tasks: ["Log today's subscriber count", "Watch the last three videos' retention and note the drop-off", "Make the next video about the one that did best"], ask: ask("How many subscribers?", "number", 2, "target", "1000") },
  ],
  Fitness: [
    { title: "Run the race", line: "Across the finish line, still smiling.", color: "ochre", tip: "Register today. A paid entry is the best training motivation there is.",
      blocks: [countdown("Race day"), next, milestones("Training plan", ["Registered", 0.1], ["First long run", 0.4], ["Peak week", 0.8], ["Taper begins", 0.93], ["Race", 1]), tracker("Weekly distance", "km", "up", "picks"), { type: "tasks", view: "when", width: "wide" }, kept],
      tasks: ["Register for the race", "Find a training plan", "Log this week's distance"], ask: when("When is the race?") },
    { title: "Hit a strength target", line: "One lift, one number, reached by a date.", color: "pine", tip: "Log today's weight on the lift, so every session has a number to beat.",
      blocks: [finish, next, tracker("Main lift", "kg", "up", "latest"), habit("Training session"), tasks, kept],
      tasks: ["Pick the lift and log today's weight", "Choose three sessions a week", "Book a form check"], ask: ask("What's the lift you're after, in kg?", "number", 2, "target", "100") },
    { title: "Reach my target weight", line: "A number, a date, and the weekly habits that get there.", color: "sage", tip: "Weigh in at the same time each morning, before breakfast, so the numbers compare.",
      blocks: [finish, next, tracker("Weight", "kg", "down", "slider"), habit("Moved today"), tasks, kept],
      tasks: ["Weigh in and log the starting point", "Choose the one meal to change first", "Book three movement sessions this week"], ask: ask("What weight are you aiming for?", "number", 2, "target", "75") },
  ],
  Mind: [
    { title: "30 days of a quiet ten minutes", line: "A month of sitting, breathing or walking without a phone.", color: "sage", tip: "Tie the ten minutes to something you already do, like the first coffee.",
      blocks: [countdown("Day 30"), next, habit("Quiet time"), tasks, kept],
      tasks: ["Choose the time of day", "Pick a timer or an app", "Do today's ten minutes"], ask: when("When does the month end?") },
    { title: "A month of screen-free evenings", line: "Phone away by a set hour, every night for a month.", color: "pine", tip: "Charge the phone outside the bedroom. Out of reach is out of mind.",
      blocks: [countdown("Day 30"), next, habit("Phone away on time"), tasks, kept],
      tasks: ["Set the hour the phone goes away", "Put a book on the nightstand", "Tell whoever you live with"], ask: when("When does the month end?") },
  ],
  Friends: [
    { title: "Host a dinner", line: "Six people round the table on a date that's set.", color: "clay", tip: "Settle the date with the two hardest-to-schedule friends first.",
      blocks: [countdown("The evening"), next, checklist("Before the evening", "Date set", "Invites sent", "Menu planned", "Shopping done", "Table set"), tasks, kept],
      tasks: ["Pick the date and the people", "Send the invites", "Plan the menu"], ask: when("When?") },
    { title: "Plan the weekend away", line: "The friends, the place and the dates, all confirmed.", color: "sage", tip: "Propose two dates, no more. More choice makes groups slower.",
      blocks: [countdown("Departure"), next, checklist("Confirmed", "Two dates proposed", "Four people said yes", "Place booked", "Travel booked", "Who brings what agreed"), tasks, kept],
      tasks: ["Propose two dates to the group", "Shortlist three places", "Book once four have said yes"], ask: when("When would you go?") },
  ],
  Travel: [
    { title: "The next trip", line: "Flights, beds and the budget, booked in the right order.", color: "ochre", tip: "Book the flights or train before the beds. Travel moves most in price.",
      blocks: [countdown("Departure"), next, milestones("Bookings", ["Dates fixed", 0.1], ["Flights or train booked", 0.3], ["Beds booked", 0.5], ["Packed", 0.98]), goal("Trip fund", "€"), tasks, kept],
      tasks: ["Fix the dates", "Book the flights or the train", "Book the first nights"], ask: when("When do you leave?") },
    { title: "Passport and visas sorted", line: "Documents valid and in the drawer before the trip.", color: "pine", tip: "Check the passport's expiry today. Many countries want six months left on it.",
      blocks: [finish, next, checklist("Documents", "Passport expiry checked", "Renewal booked if needed", "Visas listed", "Visas applied for", "Copies saved"), tasks, kept],
      tasks: ["Check the passport's expiry date", "List the visas the trip needs", "Book the renewal or the appointment"], ask: doneBy },
  ],
  Pets: [
    { title: "Vaccinations and check-up done", line: "Shots, chip and check-up up to date, in the record.", color: "clay", tip: "Find the vaccination record before you call the vet. They will ask for it.",
      blocks: [countdown("Vet visit"), next, checklist("Up to date", "Vaccination record found", "Vet booked", "Vaccines done", "Chip details checked", "Flea and worm dates noted"), tasks, kept],
      tasks: ["Find the vaccination record", "Book the vet", "Note the flea and worm treatment dates"], ask: when("When is the vet visit?") },
    { title: "Eight weeks of training", line: "Sit, stay, come back: reliable by the end of the course.", color: "sage", tip: "Ten minutes a day beats an hour on Sunday. Short sessions stick.",
      blocks: [finish, next, checklist("Commands", "Sit", "Stay", "Come back", "Leave it"), habit("Training session"), tasks, kept],
      tasks: ["Pick the three commands that matter most", "Find a class or a method", "Do the first ten-minute session"], ask: doneBy },
  ],
};

/**
 * Shapes that fit any domain, so every domain has ideas to show (D62): a domain you named yourself, or one whose own
 * starters are all built. They can be built again and again, so they are always offered.
 */
export const anyDomainStarters: StarterProject[] = [
  { title: "30 days of one small habit", line: "One small thing every day for a month, ticked as you go.", color: "sage",
    tip: "Make it small enough to do on a bad day. Showing up beats doing a lot.",
    blocks: [countdown("Day 30"), next, habit("Done today"), tasks, kept],
    tasks: ["Choose the habit and the time of day", "Tell someone you're doing it", "Do day one"] },
  { title: "Clear the loose ends", line: "Every unfinished thing here listed, then closed one by one.", color: "clay",
    tip: "Close the quickest one first. An early tick gets the list moving.",
    blocks: [finish, next, checklist("Loose ends"), tasks, kept],
    tasks: ["List every loose end you can think of", "Pick the three quickest", "Close the first one today"] },
];

/** Any starter by its title, as a project built from one remembers it (`Project.starter`). */
export const starterNamed = (title: string) => [...Object.values(starterProjects).flat(), ...anyDomainStarters].find((starter) => starter.title === title);

/**
 * What a domain's agent suggests starting there (D62): up to three of the domain's own starters not built yet, topped up
 * with the shapes that fit any domain, so there are always at least two.
 */
export const ideasFor = (data: WorkspaceData, domain: string) =>
  [...(starterProjects[domain] ?? []).filter((starter) => !isBuilt(data, domain, starter)), ...anyDomainStarters].slice(0, 3);

/**
 * Whether this template was already built in the domain (a `title` answer adds ": name", and the project dialog may
 * rename it), so it isn't offered again.
 */
export const isBuilt = (data: WorkspaceData, domain: string, starter: StarterProject) =>
  data.projects.some((project) => project.area === domain && (project.starter === starter.title || project.title === starter.title || project.title.startsWith(`${starter.title}:`)));

/**
 * The page a picked domain starts with (PARA areas carry the ongoing standards projects don't): a habit or tracker to
 * keep an eye on, the domain's projects and tasks, what's kept. A countdown without a date asks for it on the block.
 */
export const starterDomainPages: Record<string, StarterBlock[]> = {
  Health: [{ ...tracker("Sleep", "h"), target: 7.5 }, habit("Moved today"), { type: "projects", view: "tiles" }, tasks, kept],
  Family: [countdown("Next birthday"), { ...habit("Called or visited"), width: "wide" }, { type: "projects", view: "tiles", width: "wide" }, kept, { type: "tasks", view: "when" }],
  Finance: [tracker("Monthly spend", "€", "down"), { type: "tasks", view: "when", width: "half" }, { type: "projects", width: "wide" }, kept],
  Career: [{ type: "tasks", view: "when", width: "wide" }, { type: "projects", width: "narrow" }, { type: "resources", view: "recent" }],
  Business: [tracker("Monthly revenue", "€"), { type: "tasks", view: "when", width: "half" }, { type: "projects", width: "wide" }, kept],
  Home: [habit("Tidied up"), { type: "tasks", view: "when", width: "half" }, { type: "projects", view: "tiles", width: "wide" }, kept],
  Learning: [habit("Studied"), { ...goal("Books this year", "books"), target: 12 }, { type: "projects" }, tasks, kept],
  Creative: [habit("Made something"), { type: "projects", view: "tiles", width: "half" }, tasks, kept],
  Fitness: [habit("Trained"), tracker("Minutes active", "min"), { type: "projects" }, tasks, kept],
  Mind: [habit("Quiet time"), habit("Wrote in the journal"), { type: "projects", view: "tiles" }, tasks, kept],
  Friends: [habit("Reached out"), { ...countdown("Next get-together"), width: "half" }, { type: "projects", view: "tiles" }, tasks, kept],
  Travel: [countdown("Next departure"), { type: "projects", view: "tiles", width: "wide" }, tasks, kept],
  Pets: [countdown("Next vet visit"), { ...habit("Walked"), width: "wide" }, tasks, kept],
};
/** The blocks for a domain's first page, with ids; the default page when the domain has none. */
export const domainPageFor = (domain: string): Block[] | undefined =>
  starterDomainPages[domain]?.map(({ plan: _plan, ...block }, index) => ({ ...block, id: `${domain.toLocaleLowerCase()}-${index}` }));

const dayMs = 86_400_000;
const noon = (day: string) => new Date(`${day}T12:00:00`).getTime();
const dayAfter = (day: string, days: number) => new Date(noon(day) + days * dayMs).toLocaleDateString("en-CA");

/** What the project dialog adds when it starts a project from a starter (D62): its id, the finish date it picked, and the fields you edited. */
export type StarterOptions = { id?: string; finish?: string; project?: Partial<Pick<Project, "title" | "description" | "color" | "agentId" | "teamId" | "routines">> };

/**
 * Creates the starter project in `domain` with its page and tasks. `answer` fills the asked block: an empty answer
 * leaves the template as it is. `options.finish` dates the first countdown, and `options.project` overrides what the
 * template names. A milestones plan is dated from today to the finish line once that date is known.
 * Returns the change and the new project's id.
 */
export function buildStarter(data: WorkspaceData, domain: string, starter: StarterProject, answer: string, today: string,
  options: StarterOptions = {}): Change & { id: string } {
  const id = options.id ?? crypto.randomUUID();
  const blocks: Block[] = starter.blocks.map(({ plan: _plan, ...block }, index) => ({ ...block, id: `${id}-${index}`, ...block.type === "countdown" && { since: today } }));
  const value = answer.trim();
  let title = starter.title;
  if (starter.ask && value) {
    const block = blocks[starter.ask.block];
    if (starter.ask.field === "date") block.date = value;
    else if (starter.ask.field === "target") { const number = Number(value); if (Number.isFinite(number) && number > 0) block.target = number; }
    else title = `${starter.title}: ${value}`;
  }
  if (options.finish && blocks[0].type === "countdown") blocks[0].date = options.finish;
  const finishDate = blocks[0].type === "countdown" ? blocks[0].date : undefined;
  const span = finishDate ? Math.max(Math.round((noon(finishDate) - noon(today)) / dayMs), 0) : 0;
  starter.blocks.forEach((block, index) => {
    if (block.plan && finishDate)
      blocks[index].steps = block.plan.map((step) => ({ title: step.title, date: dayAfter(today, Math.round(step.at * span)), done: false }));
  });
  const made = createProject(data, {
    id, title, area: domain, description: starter.line, color: starter.color, widgets: blocks, starter: starter.title, ...options.project });
  return { ...addSteps({ data: made.data, changes: { projects: made.changes.projects } }, id, starter.tasks.map((task) => ({ title: task, due: "" })), today), id };
}

/** The day a step without one lands on: 2, 6, 12, then 14 days out, never past the finish line. */
export function stepDue(index: number, today: string, finish?: string) {
  const days = [2, 6, 12][index] ?? 14;
  return dayAfter(today, finish ? Math.min(days, Math.max(Math.round((noon(finish) - noon(today)) / dayMs), 0)) : days);
}

/**
 * Adds a project's steps (a starter's, or the ones an agent filled in, D63). A step without a day lands on the next
 * days (`stepDue`), so the week view, the board and Next up have an order.
 */
export function addSteps(change: Change, projectId: string, steps: { title: string; due: string }[], today: string): Change {
  const project = change.data.projects.find((item) => item.id === projectId)!;
  const finish = shownBlocks(project.widgets ?? defaultPages.project).find((block) => block.type === "countdown")?.date;
  let current = change.data;
  const tasks = [...change.changes.tasks ?? []];
  steps.forEach((step, index) => {
    const added = createTask(current, { title: step.title, due: step.due || stepDue(index, today, finish) }, projectId);
    current = added.data;
    tasks.push(...added.changes.tasks!);
  });
  return { ...change, data: current, changes: { ...change.changes, tasks } };
}

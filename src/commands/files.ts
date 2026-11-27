// tidy_files (agents-design D79): a proposal to move and rename files a search found on one of the account's
// computers (D78), each into a folder straight in Documents, under a clearer name, or both, with why. The browser offers
// it to an agent with Tidy files and Read files in a reply that lands in a chat; the agent function keeps it only for a
// computer whose tidying is on, and that computer's helper accepts only paths a search there found
// (supabase/functions/agent/tidy.ts). The function lands it naming the computer the reply ran on, or the one a search
// of several named its files after (D84: files never move between computers, so moves on another one drop); without a
// computer, nothing.
import { extensionOf, fileNameOf, plainName, tidyLimits } from "../../supabase/functions/agent/tidy.ts";
import type { FileMove } from "../../supabase/functions/agent/tidy.ts";
import { onComputer } from "../../supabase/functions/agent/searches.ts";
import { pending, records, textOf } from "./define.ts";
import type { CommandDef } from "./define.ts";
import { lower } from "./request.ts";

/** A new name without the extension the file keeps, also when the model wrote it in. */
const stemOf = (name: string, file: string) => {
  const extension = extensionOf(file);
  return extension && lower(name).endsWith(lower(extension)) ? name.slice(0, -extension.length) : name;
};

export const tidy_files: CommandDef = {
  needs: ["tidy-files", "read-files"],
  when: (request) => !!request.land,
  spec: () => ({
    description: "Propose tidying files search_computer found on the person's computer: each into a folder straight in their Documents, under a clearer name, or both, with why. Only files a search found.",
    progress: "Tidying your files",
    prompt: "When the person asks to tidy, sort, file away or rename files on their computer, search_computer for them first, then call tidy_files once with each file, the folder in Documents it goes in (Bank, Health, Car…) and a clearer name if it needs one, with why. Reuse the same folder for files that belong together.",
    after: "search_computer",
    args: {
      moves: { description: "The files to tidy, each by its path exactly as search_computer listed it.", list: { max: tidyLimits.moves }, fields: {
        file: { description: "The file's path exactly as search_computer listed it." },
        folder: { description: "A folder straight in Documents to put it in, one plain name such as Bank: made if it isn't there, reused if it is. Leave out to keep it where it is.", optional: true },
        name: { description: "A clearer name for it, without the extension, which stays. Leave out to keep its name.", optional: true },
        why: { description: "Why, in a few plain words the person reads beside it." },
      } },
    },
  }),
  propose: (request, args, id) => {
    let computer: { id: string; name: string } | undefined;
    const moves = records(args.moves, "file").flatMap(({ file, folder, name, why }): FileMove[] => {
      const on = onComputer(request, file?.trim() ?? "");
      // One tidy is for one computer: the first move's says which, and a move on another drops.
      if (!on || computer && on.computer.id !== computer.id) return [];
      const path = on.path.trim();
      const into = folder === undefined ? undefined : plainName(folder);
      const stem = name === undefined ? undefined : plainName(stemOf(name.trim(), path));
      const reason = textOf(why, 200);
      // A move half understood never lands: a folder or name Windows wouldn't take drops the whole move.
      if (!path || !reason || folder !== undefined && !into || name !== undefined && !stem) return [];
      const renamed = stem && lower(`${stem}${extensionOf(path)}`) !== lower(fileNameOf(path)) ? stem : undefined;
      if (!into && !renamed) return [];
      computer ??= on.computer;
      return [{ file: path, ...into && { folder: into }, ...renamed && { name: renamed }, why: reason }];
    }).filter((move, index, all) => all.findIndex((other) => lower(other.file) === lower(move.file)) === index).slice(0, tidyLimits.moves);
    return computer && moves.length ? { ...pending(id), projectId: "", items: [], files: { computer, moves } } : undefined;
  },
};

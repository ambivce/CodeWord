import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";

let meditationInterval: NodeJS.Timeout | undefined;
let bibleStudyPanel: vscode.WebviewPanel | undefined;
const config = vscode.workspace.getConfiguration("CodeWord");
const mode = config.get<string>("mode");

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  startMeditationScheduler(context);

  const disposable = vscode.commands.registerCommand(
    "code-word.unsheath",
    async () => {
      // The code you place here will be executed every time your command is executed
      // Display a message box to the user
      if (mode) {
        const bible = loadStudyContent(context, mode, true);
        // 1. Pick Book
        const book = await vscode.window.showQuickPick(Object.keys(bible), {
          placeHolder: "Select a book",
        });
        if (!book) {
          return;
        }

        // 2. Pick Chapter
        const chapters = Object.keys(bible[book]);
        const chapter = await vscode.window.showQuickPick(chapters, {
          placeHolder: "Select a chapter",
        });
        if (!chapter) {
          return;
        }

        openBibleWebview(context, [{ book, chapters: [Number(chapter)] }]);

        vscode.window.showInformationMessage(
          "Bible loaded successfully, Enjoy God's Word!"
        );
      }
    }
  );
  context.subscriptions.push(disposable);
}

function normalizeTime(input: string): string | null {
  if (!input) {
    return null;
  }

  input = input.trim().toLowerCase();

  // handle AM/PM
  const ampmMatch = input.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/);
  if (ampmMatch) {
    let hour = parseInt(ampmMatch[1], 10);
    const minute = ampmMatch[2] ? parseInt(ampmMatch[2], 10) : 0;
    const ampm = ampmMatch[3];

    if (ampm === "pm" && hour < 12) {
      hour += 12;
    }
    if (ampm === "am" && hour === 12) {
      hour = 0;
    }

    return `${hour.toString().padStart(2, "0")}:${minute
      .toString()
      .padStart(2, "0")}`;
  }

  // handle 24h formats: "7", "07", "7:00", "07:30"
  const simpleMatch = input.match(/^(\d{1,2})(?::(\d{2}))?$/);
  if (simpleMatch) {
    let hour = parseInt(simpleMatch[1], 10);
    let minute = simpleMatch[2] ? parseInt(simpleMatch[2], 10) : 0;

    if (hour > 23 || minute > 59) {
      return null;
    }

    return `${hour.toString().padStart(2, "0")}:${minute
      .toString()
      .padStart(2, "0")}`;
  }

  return null;
}

function startMeditationScheduler(context: vscode.ExtensionContext) {
  if (meditationInterval) {
    clearInterval(meditationInterval);
  }

  meditationInterval = setInterval(() => {
    const config = vscode.workspace.getConfiguration("CodeWord");

    const times = config.get<string[]>("times") || [];

    if (!mode || times.length === 0) {
      return;
    }

    const now = new Date();
    const currentTime =
      now.getHours().toString().padStart(2, "0") +
      ":" +
      now.getMinutes().toString().padStart(2, "0");

    const match = times.some((t) => normalizeTime(t) === currentTime);
    if (!match) {
      return;
    }

    if (mode === "Meditation") {
      handleMeditation(context, config);
    } else if (mode === "Reading Plan") {
      handleReadingPlan(context, config);
    }
  }, 60000); // check every minute
}

function parsePassage(passage: string): { book: string; chapters: number[] }[] {
  const results: { book: string; chapters: number[] }[] = [];

  const segments = passage.split(";").map((s) => s.trim());

  for (const segment of segments) {
    const match = segment.match(/^(.+?)\s+([\d,\-\s]+)$/);
    if (!match) {
      continue;
    }

    const book = match[1].trim();
    const chapterPart = match[2].trim();

    const chapters: number[] = [];

    // split by comma → "46, 80, 135"
    const pieces = chapterPart.split(",");

    for (const piece of pieces) {
      const part = piece.trim();

      // range: "6-8"
      if (part.includes("-")) {
        const [start, end] = part.split("-").map(Number);
        for (let c = start; c <= end; c++) {
          chapters.push(c);
        }
      } else {
        // single chapter
        chapters.push(Number(part));
      }
    }

    results.push({ book, chapters });
  }

  return results;
}

function handleMeditation(
  context: vscode.ExtensionContext,
  config: vscode.WorkspaceConfiguration
) {
  const items = config.get<string[]>("meditation.books") || [];
  if (items.length === 0) {
    return;
  }

  // Pick one randomly or rotate; here we pick random
  const entry = items[Math.floor(Math.random() * items.length)];

  const passage = parsePassage(entry);

  const match = entry.match(/^([1-3]?\s?[A-Za-z]+)\s+(\d+)$/);
  if (!passage) {
    return;
  }

  openBibleWebview(context, passage);
}

function getTodayKey(): string {
  const today = new Date();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  return `${mm}-${dd}`;
}

function getTodayReading(context: vscode.ExtensionContext) {
  if (mode) {
    const plan = loadStudyContent(context, mode, false);
    const todayKey = getTodayKey();
    return plan.find((entry: any) => entry.date === todayKey);
  }
}

function handleReadingPlan(
  context: vscode.ExtensionContext,
  config: vscode.WorkspaceConfiguration
) {
  const todayReading = getTodayReading(context);
  if (!todayReading) {
    vscode.window.showErrorMessage("No reading plan entry for today.");
    return;
  }

  const passage = todayReading.passage;

  openReadingPlanPassage(context, passage);
}

function openReadingPlanPassage(
  context: vscode.ExtensionContext,
  passage: string
) {
  const parsed = parsePassage(passage);

  if (parsed.length === 0) {
    vscode.window.showErrorMessage("Invalid reading plan format " + passage);
    return;
  }

  openBibleWebview(context, parsed);
}

function loadStudyContent(
  context: vscode.ExtensionContext,
  mode: string,
  loadBible: boolean
) {
  let jsonToLoad;
  if (mode === "Meditation" || loadBible) {
    jsonToLoad = "kjv.json";
  } else {
    jsonToLoad = "readingPlan.json";
  }
  const biblePath = path.join(
    context.extensionPath,
    "bible-data",
    `${jsonToLoad}`
  );
  const raw = fs.readFileSync(biblePath, "utf8");
  return JSON.parse(raw);
}

function openBibleWebview(
  context: vscode.ExtensionContext,
  entries: { book: string; chapters: number[] }[]
) {
  if (!bibleStudyPanel) {
    // First time → open one
    bibleStudyPanel = vscode.window.createWebviewPanel(
      "readingPlanView",
      `${mode === "Meditation" ? "Bible Meditation" : "Bible Reading"} Plan`,
      vscode.ViewColumn.One,
      {
        enableScripts: true,
      }
    );

    bibleStudyPanel.onDidDispose(() => {
      bibleStudyPanel = undefined;
    });
  }

  if (mode) {
    const bible = loadStudyContent(context, mode, true);
    let type = mode === "Meditation" ? "Meditation" : "Reading";
    let html = `<h1>Bible ${type} Plan</h1>`;

    for (const entry of entries) {
      const { book, chapters } = entry;

      html += `<h2>${book}</h2>`;

      for (const chap of chapters) {
        const chapterData = bible[book]?.[chap];
        if (!chapterData) {
          html += `<p><i>Chapter ${chap} not found</i></p>`;
          continue;
        }

        html += `<h3>Chapter ${chap}</h3>`;

        const versesHtml = Object.entries(chapterData)
          .map(([v, text]) => `<p><b>${v}</b> ${text}</p>`)
          .join("");

        html += versesHtml;
      }
    }

    bibleStudyPanel.iconPath = vscode.Uri.file(
      path.join(context.extensionPath, "resources", "bible-icon.svg")
    );
    bibleStudyPanel.webview.html = `
<!DOCTYPE html>
<html>
<body>
${html}
</body>
</html>
`;
  }
}

// This method is called when your extension is deactivated
export function deactivate() {
  if (meditationInterval) {
    clearInterval(meditationInterval);
    meditationInterval = undefined;
  }
}

let ready = false;

const JS = [
  ["log", "console.log(${1});", "Print to the output"],
  ["for", "for (let ${1:i} = 0; ${1:i} < ${2:array}.length; ${1:i}++) {\n\t${3}\n}", "for loop"],
  ["func", "function ${1:name}(${2}) {\n\t${3}\n}", "Function"],
  ["arrow", "const ${1:name} = (${2}) => {\n\t${3}\n};", "Arrow function"],
  ["fetch", "const res = await fetch(${1:url});\nconst data = await res.json();", "Fetch JSON"],
];
const PY = [
  ["def", "def ${1:name}(${2}):\n\t${3:pass}", "Function"],
  ["for", "for ${1:item} in ${2:items}:\n\t${3:pass}", "for loop"],
  ["class", "class ${1:Name}:\n\tdef __init__(self${2}):\n\t\t${3:pass}", "Class"],
  ["main", 'if __name__ == "__main__":\n\t${1:main()}', "Main guard"],
  ["try", "try:\n\t${1:pass}\nexcept ${2:Exception} as e:\n\t${3:print(e)}", "try / except"],
];

export function setupMonaco(monaco) {
  if (ready) return;
  ready = true;
  const ts = monaco.languages.typescript;
  // Real compiler checks: syntax errors and type problems show as red squiggles.
  for (const d of [ts.javascriptDefaults, ts.typescriptDefaults]) {
    d.setDiagnosticsOptions({ noSemanticValidation: false, noSyntaxValidation: false });
    d.setCompilerOptions({ target: ts.ScriptTarget.ES2020, allowNonTsExtensions: true, allowJs: true, lib: ["es2020", "dom"] });
  }
  const add = (lang, list) =>
    monaco.languages.registerCompletionItemProvider(lang, {
      provideCompletionItems: (model, pos) => {
        const w = model.getWordUntilPosition(pos);
        const range = { startLineNumber: pos.lineNumber, endLineNumber: pos.lineNumber, startColumn: w.startColumn, endColumn: w.endColumn };
        return {
          suggestions: list.map(([label, insertText, documentation]) => ({
            label, insertText, documentation, range,
            kind: monaco.languages.CompletionItemKind.Snippet,
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          })),
        };
      },
    });
  add("javascript", JS);
  add("typescript", JS);
  add("python", PY);
}

export const EDITOR_OPTIONS = {
  fontSize: 15,
  fontFamily: "ui-monospace, Menlo, Consolas, monospace",
  minimap: { enabled: false },
  padding: { top: 16 },
  smoothScrolling: true,
  glyphMargin: true,
  automaticLayout: true,
  quickSuggestions: { other: true, comments: false, strings: true },
  suggestOnTriggerCharacters: true,
  wordBasedSuggestions: "allDocuments",
  parameterHints: { enabled: true },
  acceptSuggestionOnEnter: "on",
  tabCompletion: "on",
  snippetSuggestions: "top",
};

import { App, Editor, EditorPosition, MarkdownView, Modal, Notice, Plugin, requestUrl, Setting } from 'obsidian';

interface AyahData {
	text: string;
	numberInSurah: number;
	surah: {
		name: string;
	};
}

interface ApiResponse {
	data: AyahData;
}

export default class QuranInserter extends Plugin {
	onload() {
		this.addRibbonIcon('book', 'Insert verse', () => {
			const view = this.app.workspace.getActiveViewOfType(MarkdownView);
			if (view) {
				const editor = view.editor;
				// Focus the editor to ensure getCursor() is accurate
				editor.focus();
				const cursor = editor.getCursor();
				new VerseInputModal(this.app, (result) => {
					void this.insertVerse(result, editor, cursor);
				}).open();
			} else {
				new Notice('Please open a Markdown file first.');
			}
		});

		this.addCommand({
			id: 'insert-verse',
			name: 'Insert verse',
			editorCallback: (editor: Editor) => {
				// Focus the editor to ensure getCursor() is accurate
				editor.focus();
				const cursor = editor.getCursor();
				new VerseInputModal(this.app, (result) => {
					void this.insertVerse(result, editor, cursor);
				}).open();
			}
		});
	}

	async insertVerse(input: string, editor: Editor, capturedCursor: EditorPosition) {
		const match = input.match(/^(\d+):(\d+)$/);
		if (!match) {
			new Notice('Invalid format. Please use surah:verse (e.g., 2:255).');
			return;
		}

		try {
			const response = await requestUrl({
				url: `https://api.alquran.cloud/v1/ayah/${input}`,
				method: 'GET',
			});

			if (response.status !== 200) {
				new Notice('Verse not found. Please check your input.');
				return;
			}

			const json = response.json as ApiResponse;
			const data = json.data;
			if (!data) {
				new Notice('Failed to parse API response.');
				return;
			}
			
			const surahName = data.surah.name.trim();
			const verseNumber = data.numberInSurah;
			const text = data.text.trim();

			// Use the captured line content to determine insertion style
			const lineContent = editor.getLine(capturedCursor.line);
			// Aggressively check for empty/whitespace-only lines
			const isLineEmpty = lineContent.trim() === '';

			if (isLineEmpty) {
				// Format: <div class="quran-verse" dir="rtl">Surah <a href="link">(Number)</a><br/>Text</div>\n
				const formattedText = `<div class="quran-verse" dir="rtl">${surahName} <a href="https://quran.com/ar/${input}">(${verseNumber})</a><br/>${text}</div>\n`;
				
				// Replace the entire current empty line with the verse
				editor.replaceRange(formattedText, { line: capturedCursor.line, ch: 0 }, { line: capturedCursor.line, ch: lineContent.length });
				
				// Move cursor to the new empty line after the text
				editor.setCursor({ line: capturedCursor.line + 2, ch: 0 });
			} else {
				// If the line has text, we insert BELOW it.
				const formattedText = `\n<div class="quran-verse" dir="rtl">${surahName} <a href="https://quran.com/ar/${input}">(${verseNumber})</a><br/>${text}</div>\n`;
				
				// Insert at the very end of the current line
				editor.replaceRange(formattedText, { line: capturedCursor.line, ch: lineContent.length });
				
				// Move cursor to the new empty line after the text
				editor.setCursor({ line: capturedCursor.line + 3, ch: 0 });
			}

			editor.focus();
			
		} catch {
			new Notice('Failed to fetch the verse. Please check your connection or input.');
		}
	}
}

class VerseInputModal extends Modal {
	result = '';
	submitted = false;
	onSubmit: (result: string) => void;

	constructor(app: App, onSubmit: (result: string) => void) {
		super(app);
		this.onSubmit = onSubmit;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.createEl('h2', { text: 'Insert verse' });

		new Setting(contentEl)
			.setName('Verse reference')
			.setDesc('Format: surah:verse (e.g., 2:255)')
			.addText((text) => {
				text.setPlaceholder('2:255')
					.onChange((value) => {
						this.result = value;
					});
				
				text.inputEl.addEventListener('keydown', (e) => {
					if (e.key === 'Enter') {
						e.preventDefault();
						if (!this.submitted) {
							this.submitted = true;
							const value = this.result;
							this.close();
							this.onSubmit(value);
						}
					}
				});

				// Auto-focus the input
				setTimeout(() => text.inputEl.focus(), 10);
			});

		new Setting(contentEl)
			.addButton((btn) =>
				btn
					.setButtonText('Insert')
					.setCta()
					.onClick(() => {
						if (!this.submitted) {
							this.submitted = true;
							const value = this.result;
							this.close();
							this.onSubmit(value);
						}
					})
			);
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

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
	async onload() {
		this.addRibbonIcon('book', 'Insert quran verse', () => {
			const view = this.app.workspace.getActiveViewOfType(MarkdownView);
			if (view) {
				const editor = view.editor;
				const cursor = editor.getCursor();
				new VerseInputModal(this.app, (result) => {
					void this.insertVerse(result, editor, cursor);
				}).open();
			} else {
				new Notice('Please open a Markdown file first');
			}
		});

		this.addCommand({
			id: 'insert-verse',
			name: 'Insert verse',
			editorCallback: (editor: Editor) => {
				const cursor = editor.getCursor();
				new VerseInputModal(this.app, (result) => {
					void this.insertVerse(result, editor, cursor);
				}).open();
			}
		});
	}

	async insertVerse(input: string, editor: Editor, cursor: EditorPosition) {
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
			
			const surahName = data.surah.name;
			const verseNumber = data.numberInSurah;
			const text = data.text;

			// Format text without the requested {{ }}
			const formattedText = `${surahName} (${verseNumber})\n${text}\n`;
			
			// Using replaceRange with the saved cursor position ensures precise placement
			editor.replaceRange(formattedText, cursor);
			
			// Move the cursor after the inserted text for better user experience
			const lines = formattedText.split('\n');
			const newPos = {
				line: cursor.line + lines.length - 1,
				ch: lines[lines.length - 1].length
			};
			editor.setCursor(newPos);
			editor.focus();
		} catch {
			new Notice('Failed to fetch the verse. Please check your connection or input.');
		}
	}
}

class VerseInputModal extends Modal {
	result = '';
	onSubmit: (result: string) => void;

	constructor(app: App, onSubmit: (result: string) => void) {
		super(app);
		this.onSubmit = onSubmit;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.createEl('h2', { text: 'Insert quran verse' });

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
						const value = this.result;
						this.close();
						this.onSubmit(value);
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
						const value = this.result;
						this.close();
						this.onSubmit(value);
					})
			);
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

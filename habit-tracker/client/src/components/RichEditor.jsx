import { useEffect, useRef, useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextStyle from '@tiptap/extension-text-style';
import FontFamily from '@tiptap/extension-font-family';
import Color from '@tiptap/extension-color';
import Highlight from '@tiptap/extension-highlight';
import TextAlign from '@tiptap/extension-text-align';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableHeader from '@tiptap/extension-table-header';
import TableCell from '@tiptap/extension-table-cell';
import { AlignCenter, AlignJustify, AlignLeft, AlignRight, BarChart3, Bold, Code, Highlighter, Image as ImageIcon, Italic, Link2, List, ListOrdered, Minus, Quote, Redo2, Strikethrough, Table2, Underline as UnderlineIcon, Undo2, Workflow } from 'lucide-react';
import { FontSize, compressImage } from '../richText';
import { ChartDialog, DiagramDialog } from './InsertDialogs';

const FONTS = [['Default', ''], ['Arial', 'Arial, sans-serif'], ['Georgia', 'Georgia, serif'], ['Times New Roman', '"Times New Roman", serif'],
  ['Courier New', '"Courier New", monospace'], ['Verdana', 'Verdana, sans-serif'], ['Trebuchet', '"Trebuchet MS", sans-serif']];
const SIZES = ['12px', '14px', '16px', '18px', '24px', '32px', '40px'];
const sel = 'h-8 shrink-0 rounded-md border border-zinc-200 bg-transparent px-1 text-xs dark:border-zinc-700 dark:bg-zinc-900';

const Tb = ({ label, onClick, active, children }) => (
  <button type="button" title={label} aria-label={label} onMouseDown={(e) => e.preventDefault()} onClick={onClick}
    className={`grid h-8 w-8 shrink-0 place-items-center rounded-md transition hover:bg-zinc-100 dark:hover:bg-zinc-800 ${active ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10' : 'text-zinc-600 dark:text-zinc-300'}`}>{children}</button>
);
const Sep = () => <span className="mx-1 h-5 w-px shrink-0 bg-zinc-200 dark:bg-zinc-700" />;

// header: element shown at the top of the page, above the text (the note title).
export default function RichEditor({ value, onChange, onError, header }) {
  const edRef = useRef(null);
  const fileRef = useRef(null);
  const [dlg, setDlg] = useState(null);

  const addImage = async (file) => {
    try { const src = await compressImage(file); edRef.current?.chain().focus().setImage({ src }).run(); }
    catch { onError?.('Could not read that image.'); }
  };

  const editor = useEditor({
    extensions: [StarterKit, Underline, TextStyle, FontFamily, FontSize, Color, Highlight.configure({ multicolor: true }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }), Link.configure({ openOnClick: false }),
      Image.configure({ allowBase64: true }), Table.configure({ resizable: true }), TableRow, TableHeader, TableCell,
      Placeholder.configure({ placeholder: 'Start writing... paste or drop images here.' })],
    content: value,
    onUpdate: ({ editor: e }) => onChange(e.getHTML()),
    editorProps: {
      attributes: { class: 'doc focus:outline-none' },
      handlePaste: (_, ev) => {
        const f = [...(ev.clipboardData?.files || [])].find((x) => x.type.startsWith('image/'));
        if (!f) return false;
        addImage(f); return true;
      },
      handleDrop: (_, ev) => {
        const fs = [...(ev.dataTransfer?.files || [])].filter((x) => x.type.startsWith('image/'));
        if (!fs.length) return false;
        ev.preventDefault(); fs.forEach(addImage); return true;
      },
    },
  });
  useEffect(() => { edRef.current = editor; }, [editor]);
  if (!editor) return null;

  const e = editor, c = () => e.chain().focus();
  const heading = [1, 2, 3].find((l) => e.isActive('heading', { level: l })) || 0;
  const link = () => {
    const url = window.prompt('Link address', e.getAttributes('link').href || 'https://');
    if (url === null) return;
    url === '' ? c().unsetLink().run() : c().setLink({ href: url }).run();
  };
  const insert = (src) => { e.chain().focus().setImage({ src }).run(); setDlg(null); };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-1 overflow-x-auto whitespace-nowrap border-b border-zinc-200 bg-white px-2 py-1.5 dark:border-zinc-800 dark:bg-zinc-900">
        <Tb label="Undo" onClick={() => c().undo().run()}><Undo2 size={16} /></Tb>
        <Tb label="Redo" onClick={() => c().redo().run()}><Redo2 size={16} /></Tb>
        <Sep />
        <select aria-label="Font" className={sel} value={e.getAttributes('textStyle').fontFamily || ''} onChange={(ev) => (ev.target.value ? c().setFontFamily(ev.target.value).run() : c().unsetFontFamily().run())}>
          {FONTS.map(([n, v]) => <option key={n} value={v}>{n}</option>)}
        </select>
        <select aria-label="Font size" className={sel} value={e.getAttributes('textStyle').fontSize || ''} onChange={(ev) => (ev.target.value ? c().setFontSize(ev.target.value).run() : c().unsetFontSize().run())}>
          <option value="">Size</option>{SIZES.map((s) => <option key={s} value={s}>{s.replace('px', '')}</option>)}
        </select>
        <select aria-label="Heading" className={sel} value={heading} onChange={(ev) => { const l = Number(ev.target.value); l ? c().setHeading({ level: l }).run() : c().setParagraph().run(); }}>
          <option value={0}>Text</option><option value={1}>Heading 1</option><option value={2}>Heading 2</option><option value={3}>Heading 3</option>
        </select>
        <Sep />
        <Tb label="Bold" active={e.isActive('bold')} onClick={() => c().toggleBold().run()}><Bold size={16} /></Tb>
        <Tb label="Italic" active={e.isActive('italic')} onClick={() => c().toggleItalic().run()}><Italic size={16} /></Tb>
        <Tb label="Underline" active={e.isActive('underline')} onClick={() => c().toggleUnderline().run()}><UnderlineIcon size={16} /></Tb>
        <Tb label="Strikethrough" active={e.isActive('strike')} onClick={() => c().toggleStrike().run()}><Strikethrough size={16} /></Tb>
        <Tb label="Highlight" active={e.isActive('highlight')} onClick={() => c().toggleHighlight({ color: '#fef08a' }).run()}><Highlighter size={16} /></Tb>
        <input type="color" aria-label="Text color" title="Text color" className="h-7 w-7 shrink-0 cursor-pointer rounded border-0 bg-transparent p-0"
          value={e.getAttributes('textStyle').color || '#18181b'} onChange={(ev) => c().setColor(ev.target.value).run()} />
        <Sep />
        <Tb label="Align left" active={e.isActive({ textAlign: 'left' })} onClick={() => c().setTextAlign('left').run()}><AlignLeft size={16} /></Tb>
        <Tb label="Center" active={e.isActive({ textAlign: 'center' })} onClick={() => c().setTextAlign('center').run()}><AlignCenter size={16} /></Tb>
        <Tb label="Align right" active={e.isActive({ textAlign: 'right' })} onClick={() => c().setTextAlign('right').run()}><AlignRight size={16} /></Tb>
        <Tb label="Justify" active={e.isActive({ textAlign: 'justify' })} onClick={() => c().setTextAlign('justify').run()}><AlignJustify size={16} /></Tb>
        <Sep />
        <Tb label="Bullet list" active={e.isActive('bulletList')} onClick={() => c().toggleBulletList().run()}><List size={16} /></Tb>
        <Tb label="Numbered list" active={e.isActive('orderedList')} onClick={() => c().toggleOrderedList().run()}><ListOrdered size={16} /></Tb>
        <Tb label="Quote" active={e.isActive('blockquote')} onClick={() => c().toggleBlockquote().run()}><Quote size={16} /></Tb>
        <Tb label="Code block" active={e.isActive('codeBlock')} onClick={() => c().toggleCodeBlock().run()}><Code size={16} /></Tb>
        <Tb label="Divider line" onClick={() => c().setHorizontalRule().run()}><Minus size={16} /></Tb>
        <Tb label="Link" active={e.isActive('link')} onClick={link}><Link2 size={16} /></Tb>
        <Sep />
        <Tb label="Insert table" onClick={() => c().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}><Table2 size={16} /></Tb>
        <Tb label="Insert image" onClick={() => fileRef.current?.click()}><ImageIcon size={16} /></Tb>
        <Tb label="Insert chart" onClick={() => setDlg('chart')}><BarChart3 size={16} /></Tb>
        <Tb label="Insert diagram" onClick={() => setDlg('diagram')}><Workflow size={16} /></Tb>
        {e.isActive('table') && (
          <>
            <Sep />
            {[['+ Row', () => c().addRowAfter().run()], ['+ Column', () => c().addColumnAfter().run()], ['- Row', () => c().deleteRow().run()], ['- Column', () => c().deleteColumn().run()], ['Delete table', () => c().deleteTable().run()]].map(([l, f]) => (
              <button key={l} type="button" onMouseDown={(ev) => ev.preventDefault()} onClick={f} className="h-8 shrink-0 rounded-md px-2 text-xs hover:bg-zinc-100 dark:hover:bg-zinc-800">{l}</button>
            ))}
          </>
        )}
        <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(ev) => { [...ev.target.files].forEach(addImage); ev.target.value = ''; }} />
      </div>
      <div className="flex-1 overflow-y-auto px-2 py-3 sm:p-5">
        <div className="mx-auto min-h-full max-w-4xl rounded-xl bg-white p-4 text-zinc-900 shadow-lg sm:p-8">
          {header}
          <EditorContent editor={editor} />
        </div>
      </div>
      {dlg === 'chart' && <ChartDialog onClose={() => setDlg(null)} onInsert={insert} />}
      {dlg === 'diagram' && <DiagramDialog onClose={() => setDlg(null)} onInsert={insert} />}
    </div>
  );
}

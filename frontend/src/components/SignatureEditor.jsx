// Editeur de signature de courriel (TASK-007.1, 2026-10-08) : texte et images, polices, tailles, couleurs, liens,
// alignement -- « tous les outils pour faire une petite présentation ». Coller depuis Outlook/Gmail garde la mise en
// forme ; les images sont gardees dans la signature (data:) et deviennent des pieces integrees a l'envoi.
import { useEffect, useRef, useState } from 'react'
import { useEditor, EditorContent, useEditorState } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { TextStyleKit } from '@tiptap/extension-text-style'
import Image from '@tiptap/extension-image'
import TextAlign from '@tiptap/extension-text-align'
import Highlight from '@tiptap/extension-highlight'

const FONTS = ['Arial', 'Calibri', 'Georgia', 'Helvetica', 'Tahoma', 'Times New Roman', 'Trebuchet MS', 'Verdana', 'Courier New']
const SIZES = [9, 10, 11, 12, 13, 14, 16, 18, 20, 24, 28, 32, 36]
const MAX_IMAGE_WIDTH = 600

// Image choisie ou collee -> data: (reduite a 600 px de large au plus : une signature n'a pas besoin de plus)
function readImage(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onerror = reject
    r.onload = () => {
      if (file.type === 'image/gif' || file.type === 'image/svg+xml') return resolve(r.result)   // animation / vectoriel gardes tels quels
      const img = new window.Image()
      img.onerror = reject
      img.onload = () => {
        if (img.width <= MAX_IMAGE_WIDTH) return resolve(r.result)
        const c = document.createElement('canvas')
        c.width = MAX_IMAGE_WIDTH; c.height = Math.round(img.height * MAX_IMAGE_WIDTH / img.width)
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height)
        resolve(c.toDataURL(file.type === 'image/jpeg' ? 'image/jpeg' : 'image/png', 0.9))
      }
      img.src = r.result
    }
    r.readAsDataURL(file)
  })
}

const btn = active => ({
  minWidth: 30, height: 30, padding: '0 8px', border: '1px solid #D1D5DB', borderRadius: 6, cursor: 'pointer', fontSize: 13,
  background: active ? '#DBEAFE' : '#fff', color: active ? '#1D4ED8' : '#111827',
})
const sel = { height: 30, border: '1px solid #D1D5DB', borderRadius: 6, fontSize: 13, padding: '0 6px', background: '#fff' }
const sep = <span style={{ width: 1, alignSelf: 'stretch', background: '#E5E7EB', margin: '0 2px' }} />

export default function SignatureEditor({ value, onChange }) {
  const fileRef = useRef()
  const [warning, setWarning] = useState('')
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ link: { openOnClick: false, autolink: true } }),
      TextStyleKit,
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Image.configure({ inline: true, allowBase64: true, resize: { enabled: true, alwaysPreserveAspectRatio: true, minWidth: 16, minHeight: 16 } }),
    ],
    content: value || '',
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    editorProps: {
      // Images copiees d'Outlook (fichier:// sur l'ordinateur) : illisibles ailleurs -> retirees, avec un avertissement
      transformPastedHTML(html) {
        const cleaned = html.replace(/<img[^>]+src=["'](?:file:|cid:)[^"']*["'][^>]*>/gi, '')
        setWarning(cleaned !== html ? "Certaines images collées viennent de votre ordinateur et ne peuvent pas être copiées : ajoutez-les avec le bouton « Image »." : '')
        return cleaned
      },
      // Image seule dans le presse-papiers (capture d'écran, « copier l'image ») -> inseree
      handlePaste(view, event) {
        const files = [...(event.clipboardData?.files || [])].filter(f => f.type.startsWith('image/'))
        if (!files.length || event.clipboardData.getData('text/html')) return false
        files.forEach(f => readImage(f).then(src => editor?.chain().focus().setImage({ src }).run()))
        return true
      },
    },
  })

  const st = useEditorState({
    editor,
    selector: ({ editor: e }) => e ? {
      bold: e.isActive('bold'), italic: e.isActive('italic'), underline: e.isActive('underline'), strike: e.isActive('strike'),
      link: e.isActive('link'), bullet: e.isActive('bulletList'),
      left: e.isActive({ textAlign: 'left' }), center: e.isActive({ textAlign: 'center' }), right: e.isActive({ textAlign: 'right' }),
      font: e.getAttributes('textStyle').fontFamily || '', size: e.getAttributes('textStyle').fontSize || '',
      color: e.getAttributes('textStyle').color || '#000000',
    } : {},
  })

  useEffect(() => { if (editor && value !== editor.getHTML()) editor.commands.setContent(value || '', { emitUpdate: false }) }, [value])  // eslint-disable-line

  if (!editor) return null
  const c = () => editor.chain().focus()

  function setLink() {
    const prev = editor.getAttributes('link').href || ''
    const url = window.prompt('Adresse du lien (https://…, mailto:…, tel:…) — vide pour retirer le lien', prev)
    if (url === null) return
    if (!url.trim()) return c().extendMarkRange('link').unsetLink().run()
    const href = /^(https?:|mailto:|tel:)/i.test(url.trim()) ? url.trim() : `https://${url.trim()}`
    c().extendMarkRange('link').setLink({ href }).run()
  }

  async function addImages(files) {
    for (const f of [...files].filter(f => f.type.startsWith('image/'))) c().setImage({ src: await readImage(f) }).run()
    fileRef.current.value = ''
  }

  return (
    <div style={{ border: '1px solid #D1D5DB', borderRadius: 8, overflow: 'hidden' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, padding: 6, background: '#F9FAFB', borderBottom: '1px solid #E5E7EB' }}>
        <select style={{ ...sel, width: 130 }} value={st.font} title="Police"
          onChange={e => e.target.value ? c().setFontFamily(e.target.value).run() : c().unsetFontFamily().run()}>
          <option value="">Police</option>
          {FONTS.map(f => <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>)}
        </select>
        <select style={{ ...sel, width: 70 }} value={st.size} title="Taille"
          onChange={e => e.target.value ? c().setFontSize(e.target.value).run() : c().unsetFontSize().run()}>
          <option value="">Taille</option>
          {SIZES.map(s => <option key={s} value={`${s}px`}>{s}</option>)}
        </select>
        {sep}
        <button type="button" style={{ ...btn(st.bold), fontWeight: 700 }} title="Gras" onClick={() => c().toggleBold().run()}>G</button>
        <button type="button" style={{ ...btn(st.italic), fontStyle: 'italic' }} title="Italique" onClick={() => c().toggleItalic().run()}>I</button>
        <button type="button" style={{ ...btn(st.underline), textDecoration: 'underline' }} title="Souligné" onClick={() => c().toggleUnderline().run()}>S</button>
        <button type="button" style={{ ...btn(st.strike), textDecoration: 'line-through' }} title="Barré" onClick={() => c().toggleStrike().run()}>ab</button>
        <label style={{ ...btn(false), display: 'inline-flex', alignItems: 'center', gap: 4 }} title="Couleur du texte">
          A<input type="color" value={/^#[0-9a-f]{6}$/i.test(st.color) ? st.color : '#000000'} onChange={e => c().setColor(e.target.value).run()} style={{ width: 18, height: 18, border: 'none', padding: 0, background: 'none' }} />
        </label>
        <label style={{ ...btn(false), display: 'inline-flex', alignItems: 'center', gap: 4 }} title="Surligner">
          ▮<input type="color" defaultValue="#FEF08A" onChange={e => c().setHighlight({ color: e.target.value }).run()} style={{ width: 18, height: 18, border: 'none', padding: 0, background: 'none' }} />
        </label>
        {sep}
        <button type="button" style={btn(st.left)} title="Aligner à gauche" onClick={() => c().setTextAlign('left').run()}>⇤</button>
        <button type="button" style={btn(st.center)} title="Centrer" onClick={() => c().setTextAlign('center').run()}>↔</button>
        <button type="button" style={btn(st.right)} title="Aligner à droite" onClick={() => c().setTextAlign('right').run()}>⇥</button>
        <button type="button" style={btn(st.bullet)} title="Liste à puces" onClick={() => c().toggleBulletList().run()}>•</button>
        {sep}
        <button type="button" style={btn(st.link)} title="Lien (site web, courriel, téléphone, prise de rendez-vous)" onClick={setLink}>🔗 Lien</button>
        <button type="button" style={btn(false)} title="Ajouter une image (logo, icône…)" onClick={() => fileRef.current.click()}>🖼 Image</button>
        <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={e => addImages(e.target.files)} />
        <button type="button" style={btn(false)} title="Ligne de séparation" onClick={() => c().setHorizontalRule().run()}>―</button>
        {sep}
        <button type="button" style={btn(false)} title="Enlever la mise en forme" onClick={() => c().unsetAllMarks().clearNodes().run()}>⌫ Format</button>
        <button type="button" style={btn(false)} title="Annuler" onClick={() => c().undo().run()}>↶</button>
        <button type="button" style={btn(false)} title="Rétablir" onClick={() => c().redo().run()}>↷</button>
      </div>
      <style>{`
        .sig-editor .ProseMirror { min-height: 220px; max-height: 420px; overflow-y: auto; padding: 12px 14px; outline: none; font-family: Arial, sans-serif; font-size: 14px; color: #333; }
        .sig-editor .ProseMirror p { margin: 0; }
        .sig-editor .ProseMirror img { max-width: 100%; }
        .sig-editor .ProseMirror a { color: #1D4ED8; text-decoration: underline; }
        .sig-editor .ProseMirror hr { border: none; border-top: 1px solid #D1D5DB; margin: 8px 0; }
        .sig-editor .ProseMirror ul { padding-left: 22px; margin: 0; }
      `}</style>
      <EditorContent editor={editor} className="sig-editor" />
      {warning && <div style={{ padding: '6px 12px', fontSize: 12, color: '#B45309', background: '#FFFBEB', borderTop: '1px solid #FDE68A' }}>{warning}</div>}
    </div>
  )
}

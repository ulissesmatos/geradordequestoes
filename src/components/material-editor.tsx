"use client";

import { useCallback, useState, useTransition } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { Bold, Heading2, Heading3, Italic, List, ListOrdered, Pencil, Save, X } from "lucide-react";
import { updateStudyMaterialAction } from "@/app/(app)/actions/material-actions";
import { Button } from "@/components/ui/button";

function mdToHtml(md: string): string {
  return md
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/^[-*]\s+(.+)$/gm, "<li>$1</li>")
    .replace(/(<li>.*<\/li>\n?)+/g, (m) => `<ul>${m}</ul>`)
    .replace(/^\d+\.\s+(.+)$/gm, "<li>$1</li>")
    .replace(/^-{3,}$/gm, "<hr/>")
    .replace(/\n\n+/g, "</p><p>")
    .replace(/^(?!<[hH1-6oulp]|<hr)(.+)$/gm, "<p>$1</p>")
    .replace(/<p><\/p>/g, "");
}

function htmlToMd(html: string): string {
  return html
    .replace(/<h1>(.*?)<\/h1>/g, "# $1\n")
    .replace(/<h2>(.*?)<\/h2>/g, "## $1\n")
    .replace(/<h3>(.*?)<\/h3>/g, "### $1\n")
    .replace(/<strong>(.*?)<\/strong>/g, "**$1**")
    .replace(/<em>(.*?)<\/em>/g, "*$1*")
    .replace(/<ul>([\s\S]*?)<\/ul>/g, (_, items) =>
      items.replace(/<li>(.*?)<\/li>/g, "- $1\n")
    )
    .replace(/<ol>([\s\S]*?)<\/ol>/g, (_, items) => {
      let i = 1;
      return items.replace(/<li>(.*?)<\/li>/g, (_: string, text: string) => `${i++}. ${text}\n`);
    })
    .replace(/<hr\s*\/?>/g, "\n---\n")
    .replace(/<p>([\s\S]*?)<\/p>/g, "$1\n\n")
    .replace(/<br\s*\/?>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function MaterialEditor({ materialId, initialContent }: { materialId: string; initialContent: string }) {
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);
  const [, startTransition] = useTransition();

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: "Escreva o conteúdo do material..." })
    ],
    content: mdToHtml(initialContent),
    editable: editing,
    editorProps: {
      attributes: { class: "prose prose-sm max-w-none min-h-[300px] focus:outline-none p-4" }
    }
  }, [editing]);

  const handleSave = useCallback(() => {
    if (!editor) return;
    const html = editor.getHTML();
    const md = htmlToMd(html);
    startTransition(async () => {
      await updateStudyMaterialAction(materialId, md);
      setSaved(true);
      setEditing(false);
      setTimeout(() => setSaved(false), 2000);
    });
  }, [editor, materialId]);

  if (!editing) {
    return (
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
          <Pencil className="h-4 w-4" />
          {saved ? "Salvo!" : "Editar material"}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--surface-subtle)] p-2">
        <ToolbarButton onClick={() => editor?.chain().focus().toggleBold().run()} title="Negrito">
          <Bold className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor?.chain().focus().toggleItalic().run()} title="Itálico">
          <Italic className="h-4 w-4" />
        </ToolbarButton>
        <div className="h-5 w-px bg-[var(--border)]" />
        <ToolbarButton onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()} title="Título H2">
          <Heading2 className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()} title="Título H3">
          <Heading3 className="h-4 w-4" />
        </ToolbarButton>
        <div className="h-5 w-px bg-[var(--border)]" />
        <ToolbarButton onClick={() => editor?.chain().focus().toggleBulletList().run()} title="Lista">
          <List className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor?.chain().focus().toggleOrderedList().run()} title="Lista numerada">
          <ListOrdered className="h-4 w-4" />
        </ToolbarButton>
        <div className="ml-auto flex gap-1">
          <Button size="sm" variant="outline" onClick={() => setEditing(false)}>
            <X className="h-4 w-4" />
            Cancelar
          </Button>
          <Button size="sm" onClick={handleSave}>
            <Save className="h-4 w-4" />
            Salvar
          </Button>
        </div>
      </div>
      <div className="rounded-md border border-[var(--border)] bg-[var(--surface)]">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

function ToolbarButton({ onClick, title, children }: { onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="rounded p-1.5 hover:bg-[var(--surface)] transition-colors text-[var(--foreground)]"
    >
      {children}
    </button>
  );
}

"use client";

import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { marked } from "marked";
import TurndownService from "turndown";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import {
  Bold,
  Check,
  Code2,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  List,
  ListOrdered,
  Loader2,
  Minus,
  Pencil,
  Redo2,
  Strikethrough,
  TextQuote,
  Undo2,
  X
} from "lucide-react";
import { updateStudyMaterialAction } from "@/app/(app)/actions/material-actions";
import { MarkdownContent } from "@/components/markdown-content";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

marked.setOptions({ breaks: true, gfm: true });

function createTurndown() {
  const service = new TurndownService({
    headingStyle: "atx",
    bulletListMarker: "-",
    codeBlockStyle: "fenced",
    hr: "---",
    emDelimiter: "*"
  });
  // O conteúdo nasce como markdown; round-trip fiel sem escapar marcadores literais
  service.escape = (text) => text;
  return service;
}

export function MaterialEditor({ materialId, initialContent }: { materialId: string; initialContent: string }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [content, setContent] = useState(initialContent);
  const [savedFlash, setSavedFlash] = useState(false);

  const handleSaved = useCallback(
    (markdown: string) => {
      setContent(markdown);
      setEditing(false);
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2500);
      router.refresh();
    },
    [router]
  );

  if (editing) {
    return (
      <RichEditor
        materialId={materialId}
        content={content}
        onCancel={() => setEditing(false)}
        onSaved={handleSaved}
      />
    );
  }

  return (
    <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-sm)]">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--surface-subtle)] px-5 py-2.5">
        <span className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
          Conteúdo do material
        </span>
        <div className="flex items-center gap-2">
          {savedFlash && (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 animate-fade-in">
              <Check className="h-3.5 w-3.5" />
              Alterações salvas
            </span>
          )}
          <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
            <Pencil className="h-4 w-4" />
            Editar
          </Button>
        </div>
      </div>
      <div className="px-6 py-7 md:px-9 md:py-8">
        <MarkdownContent content={content} />
      </div>
    </div>
  );
}

function RichEditor({
  materialId,
  content,
  onCancel,
  onSaved
}: {
  materialId: string;
  content: string;
  onCancel: () => void;
  onSaved: (markdown: string) => void;
}) {
  const [isSaving, startTransition] = useTransition();

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: "Escreva o conteúdo do material..." })
    ],
    content: marked.parse(content, { async: false }),
    immediatelyRender: false,
    editorProps: {
      attributes: { class: "rich-editor-content" }
    }
  });

  const handleSave = useCallback(() => {
    if (!editor) return;
    const markdown = createTurndown().turndown(editor.getHTML());
    startTransition(async () => {
      await updateStudyMaterialAction(materialId, markdown);
      onSaved(markdown);
    });
  }, [editor, materialId, onSaved]);

  return (
    <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--primary)] bg-[var(--surface)] shadow-[var(--shadow-md)]">
      <div className="sticky top-0 z-10 border-b border-[var(--border)] bg-[var(--surface)]/95 backdrop-blur supports-[backdrop-filter]:bg-[var(--surface)]/85">
        <div className="flex flex-wrap items-center gap-x-1 gap-y-1.5 px-3 py-2">
          {editor && <Toolbar editor={editor} />}
          <div className="ml-auto flex items-center gap-2 pl-2">
            <Button size="sm" variant="ghost" onClick={onCancel} disabled={isSaving}>
              <X className="h-4 w-4" />
              Cancelar
            </Button>
            <Button size="sm" onClick={handleSave} disabled={isSaving || !editor}>
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              {isSaving ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </div>
      </div>
      <div className="rich-editor cursor-text" onClick={() => editor?.chain().focus().run()}>
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  const state = useEditorState({
    editor,
    selector: (ctx) => ({
      bold: ctx.editor.isActive("bold"),
      italic: ctx.editor.isActive("italic"),
      strike: ctx.editor.isActive("strike"),
      h1: ctx.editor.isActive("heading", { level: 1 }),
      h2: ctx.editor.isActive("heading", { level: 2 }),
      h3: ctx.editor.isActive("heading", { level: 3 }),
      bulletList: ctx.editor.isActive("bulletList"),
      orderedList: ctx.editor.isActive("orderedList"),
      blockquote: ctx.editor.isActive("blockquote"),
      codeBlock: ctx.editor.isActive("codeBlock"),
      canUndo: ctx.editor.can().undo(),
      canRedo: ctx.editor.can().redo()
    })
  });

  const chain = () => editor.chain().focus();

  return (
    <>
      <ToolbarGroup>
        <ToolbarButton title="Desfazer (Ctrl+Z)" disabled={!state.canUndo} onClick={() => chain().undo().run()}>
          <Undo2 className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton title="Refazer (Ctrl+Y)" disabled={!state.canRedo} onClick={() => chain().redo().run()}>
          <Redo2 className="h-4 w-4" />
        </ToolbarButton>
      </ToolbarGroup>
      <ToolbarDivider />
      <ToolbarGroup>
        <ToolbarButton title="Título 1" active={state.h1} onClick={() => chain().toggleHeading({ level: 1 }).run()}>
          <Heading1 className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton title="Título 2" active={state.h2} onClick={() => chain().toggleHeading({ level: 2 }).run()}>
          <Heading2 className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton title="Título 3" active={state.h3} onClick={() => chain().toggleHeading({ level: 3 }).run()}>
          <Heading3 className="h-4 w-4" />
        </ToolbarButton>
      </ToolbarGroup>
      <ToolbarDivider />
      <ToolbarGroup>
        <ToolbarButton title="Negrito (Ctrl+B)" active={state.bold} onClick={() => chain().toggleBold().run()}>
          <Bold className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton title="Itálico (Ctrl+I)" active={state.italic} onClick={() => chain().toggleItalic().run()}>
          <Italic className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton title="Tachado" active={state.strike} onClick={() => chain().toggleStrike().run()}>
          <Strikethrough className="h-4 w-4" />
        </ToolbarButton>
      </ToolbarGroup>
      <ToolbarDivider />
      <ToolbarGroup>
        <ToolbarButton title="Lista com marcadores" active={state.bulletList} onClick={() => chain().toggleBulletList().run()}>
          <List className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton title="Lista numerada" active={state.orderedList} onClick={() => chain().toggleOrderedList().run()}>
          <ListOrdered className="h-4 w-4" />
        </ToolbarButton>
      </ToolbarGroup>
      <ToolbarDivider />
      <ToolbarGroup>
        <ToolbarButton title="Citação" active={state.blockquote} onClick={() => chain().toggleBlockquote().run()}>
          <TextQuote className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton title="Bloco de código" active={state.codeBlock} onClick={() => chain().toggleCodeBlock().run()}>
          <Code2 className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton title="Linha divisória" onClick={() => chain().setHorizontalRule().run()}>
          <Minus className="h-4 w-4" />
        </ToolbarButton>
      </ToolbarGroup>
    </>
  );
}

function ToolbarGroup({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center gap-0.5">{children}</div>;
}

function ToolbarDivider() {
  return <div className="mx-1 h-5 w-px shrink-0 bg-[var(--border)]" />;
}

function ToolbarButton({
  onClick,
  title,
  active = false,
  disabled = false,
  children
}: {
  onClick: () => void;
  title: string;
  active?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      disabled={disabled}
      aria-pressed={active}
      className={cn(
        "rounded-[var(--radius-sm)] p-1.5 transition-colors",
        active
          ? "bg-[var(--primary-soft)] text-[var(--primary)]"
          : "text-[var(--muted-foreground)] hover:bg-[var(--surface-subtle)] hover:text-[var(--foreground)]",
        disabled && "cursor-not-allowed opacity-40 hover:bg-transparent hover:text-[var(--muted-foreground)]"
      )}
    >
      {children}
    </button>
  );
}

import { CAPABILITY_KEYS, CAPABILITIES, type Capabilities } from "@/lib/capabilities";
import { Input } from "@/components/ui/input";

/**
 * Campos de capabilities gerados a partir do registry (src/lib/capabilities.ts).
 *
 * Iterar o registry em vez de listar os campos à mão é o ponto do desenho: feature nova
 * aparece aqui sozinha, e o `readCapabilitiesFromForm` do lado da action lê pela mesma
 * lista — não dá para os dois lados saírem de sincronia.
 */
export function PlanCapabilitiesFieldset({ values }: { values: Capabilities }) {
  return (
    <fieldset className="rounded-md border border-[var(--border)] p-3">
      <legend className="px-1 text-xs font-semibold uppercase text-[var(--muted-foreground)]">
        O que este plano libera
      </legend>

      {/*
        Marcador de que o formulário renderizou o fieldset. Checkbox desmarcado não é
        enviado no POST, então a action não tem como distinguir "desmarquei tudo" de
        "este formulário nem mostra capabilities" — sem esta flag, um formulário futuro
        que esqueça o fieldset apagaria as capabilities do plano em silêncio.
      */}
      <input type="hidden" name="capabilitiesSubmitted" value="1" />

      <div className="grid gap-3 sm:grid-cols-2">
        {CAPABILITY_KEYS.map((key) => {
          const def = CAPABILITIES[key];
          const field = `cap:${key}`;
          return (
            <label key={key} className="flex gap-2 text-sm">
              {def.type === "int" ? (
                <span className="grid flex-1 gap-1">
                  <span className="font-medium">{def.label}</span>
                  <Input name={field} type="number" min={0} defaultValue={String(values[key])} />
                  <span className="text-xs font-normal text-[var(--muted-foreground)]">{def.helpText}</span>
                </span>
              ) : (
                <>
                  <input
                    name={field}
                    type="checkbox"
                    defaultChecked={values[key] === true}
                    className="mt-0.5 h-4 w-4 shrink-0"
                  />
                  <span className="grid gap-0.5">
                    <span className="font-medium">{def.label}</span>
                    <span className="text-xs font-normal text-[var(--muted-foreground)]">{def.helpText}</span>
                  </span>
                </>
              )}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

import Link from "next/link";
import { Wave } from "@/components/saasable/wave";
import { Reveal } from "@/components/saasable/reveal";

export function SaasableTeamsCta() {
  return (
    <section className="common-section">
      <div className="saasable-container">
        <Reveal className="p-6 sm:p-8 md:p-10 rounded-3xl sm:rounded-[32px] md:rounded-[40px] bg-theme-bg-default overflow-hidden flex flex-col gap-6 h-full">
          <div className="grid grid-cols-12 gap-y-10 sm:gap-0 md:gap-6">
            <div className="col-span-12 sm:col-span-9 lg:col-span-8 self-end">
              <div className="flex flex-col gap-10">
                <div className="flex flex-col gap-2">
                  <div className="inline-flex w-fit items-center gap-2 rounded-full border border-theme-divider bg-theme-bg-paper px-3 py-1 caption text-theme-text-secondary">
                    <i className="ti ti-building text-base leading-none" />
                    Planos para empresas
                  </div>
                  <div className="text-primary-500">
                    <Wave className="w-[92px] md:w-[122px] h-auto" />
                  </div>
                </div>
                <div className="flex flex-col gap-4 sm:gap-6">
                  <h2 className="h2">Assinaturas em grupo para equipes e cursinhos</h2>
                  <p className="body1 text-theme-text-secondary max-w-[520px]">
                    Ofereça acesso premium para vários alunos em um único pacote. Ideal para empresas, escolas e
                    grupos de estudo.
                  </p>
                </div>
              </div>
            </div>
            <div className="col-span-12 sm:col-span-3 lg:col-span-4 self-end flex items-end justify-start sm:justify-end">
              <Link href="/contato?empresa=1" className="btn btn-primary btn-lg lg:min-w-[220px]">
                Falar com a gente
              </Link>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

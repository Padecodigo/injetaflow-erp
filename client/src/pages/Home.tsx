import { useState, type FormEvent, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { ArrowLeft, Boxes, CheckCircle2, ChevronRight, Loader2, LogIn, Mail, MapPin, Menu, QrCode, ShieldCheck, Sparkles, Upload, Users, Wrench, X } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { errorMessage, readFileAsBase64 } from "@/erp/api";
import { telefoneError } from "@shared/erp/contato";

/*
 * Portal público da Wamovale. Os formulários (cotação, contato e currículo) gravam no servidor
 * (trpc.publico.enviarSolicitacao) e aparecem no ERP em "Solicitações do site" (B19/B20/B21).
 * Nenhum código do ERP ou credencial fica aqui (B12).
 */

const MAX_FILE_BYTES = 5 * 1024 * 1024;

function MenuToggle({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <button type="button" className="public-menu-toggle" aria-label={open ? "Fechar menu" : "Abrir menu"} aria-expanded={open} aria-controls="public-nav" onClick={onToggle}>
      {open ? <X size={20} /> : <Menu size={20} />}
    </button>
  );
}

/** Cabeçalho das páginas internas do portal, com menu hambúrguer no celular (B17). */
function PublicHeader() {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <header className="public-form-header">
      <Link href="/"><img src="/tenant/wamovale-logo.jpg" alt="Wamovale" /></Link>
      <MenuToggle open={menuOpen} onToggle={() => setMenuOpen(!menuOpen)} />
      <nav id="public-nav" className={`institutional-nav ${menuOpen ? "public-nav--open" : ""}`} onClick={() => setMenuOpen(false)}>
        <Link href="/quem-somos">Quem somos</Link>
        <Link href="/produtos">Produtos</Link>
        <Link href="/moldes-e-ferramentaria">Projetos e engenharia</Link>
        <Link href="/trabalhe-conosco">Trabalhe conosco</Link>
        <Link className="portal-login-link" href="/erp"><LogIn size={15} /> Área do colaborador</Link>
      </nav>
    </header>
  );
}

/** Rodapé com links para todas as páginas públicas (B18: nenhuma rota órfã). */
function PublicFooter({ back, note }: { back?: boolean; note?: ReactNode }) {
  return (
    <footer className="portal-footer public-footer">
      {back ? <Link className="portal-secondary-link" href="/"><ArrowLeft size={14} /> Voltar ao início</Link> : <span>Transformando ideias em soluções plásticas.</span>}
      <nav className="public-footer__links" aria-label="Mapa do site">
        <Link href="/quem-somos">Quem somos</Link>
        <Link href="/produtos">Produtos</Link>
        <Link href="/injecao-plastica">Injeção plástica</Link>
        <Link href="/moldes-e-ferramentaria">Moldes e ferramentaria</Link>
        <Link href="/materiais-e-pigmentos">Materiais e pigmentos</Link>
        <Link href="/qualidade-institucional">Qualidade</Link>
        <Link href="/cotacao">Cotação</Link>
        <Link href="/trabalhe-conosco">Trabalhe conosco</Link>
        <Link href="/contato">Contato</Link>
      </nav>
      <span>{note ?? "Wamovale · São José dos Campos · SP"}</span>
    </footer>
  );
}

type Envio = { status: "idle" | "sending" | "sent" | "error"; protocolo?: string; error?: string };

function useEnvio() {
  const mutation = trpc.publico.enviarSolicitacao.useMutation();
  const [envio, setEnvio] = useState<Envio>({ status: "idle" });
  const enviar = async (payload: Parameters<typeof mutation.mutateAsync>[0], sucesso: string) => {
    setEnvio({ status: "sending" });
    try {
      const out = await mutation.mutateAsync(payload);
      setEnvio({ status: "sent", protocolo: out.protocolo });
      toast.success(sucesso, { description: `Protocolo ${out.protocolo}. Guarde este número para acompanhar o retorno.` });
      return true;
    } catch (error) {
      const message = errorMessage(error);
      setEnvio({ status: "error", error: message });
      toast.error("Não foi possível enviar", { description: message });
      return false;
    }
  };
  return { envio, enviar, reset: () => setEnvio({ status: "idle" }) };
}

async function fileToAnexo(file: File | null | undefined) {
  if (!file || file.size === 0) return undefined;
  if (file.size > MAX_FILE_BYTES) throw new Error("Arquivo acima de 5 MB. Envie uma versão menor.");
  return { nome: file.name, base64: await readFileAsBase64(file) };
}

function text(form: FormData, key: string) {
  return String(form.get(key) ?? "").trim();
}

function Sent({ envio, children, onReset }: { envio: Envio; children: ReactNode; onReset: () => void }) {
  return (
    <div className="public-sent" role="status" data-testid="envio-ok">
      <CheckCircle2 size={28} />
      <h2>Recebemos sua mensagem</h2>
      <p>{children}</p>
      <p className="public-sent__protocol">Protocolo <b>{envio.protocolo}</b></p>
      <button type="button" className="button button--portal" onClick={onReset}>Enviar outra</button>
    </div>
  );
}

/** N06: erro visível junto ao campo (texto em português, sem depender do balão nativo). */
function FieldError({ id, message }: { id: string; message?: string | null }) {
  return message ? <small id={id} className="erp-field-error public-field-error" role="alert">{message}</small> : null;
}

function TelefoneField({ error, onInput }: { error?: string | null; onInput: () => void }) {
  return <><input name="telefone" type="tel" inputMode="tel" autoComplete="tel" maxLength={25} placeholder="(00) 00000-0000" aria-invalid={error ? true : undefined} aria-describedby={error ? "telefone-erro" : undefined} onInput={onInput} /><FieldError id="telefone-erro" message={error} /></>;
}

function Honeypot() {
  return <label className="sr-only" aria-hidden="true">Não preencha<input name="website" tabIndex={-1} autoComplete="off" /></label>;
}

function Consent({ children }: { children: ReactNode }) {
  return <label className="public-consent"><input type="checkbox" name="consentimento" required /><span>{children}</span></label>;
}

function SubmitButton({ envio, label }: { envio: Envio; label: string }) {
  return (
    <button className="button button--portal lead-submit" type="submit" disabled={envio.status === "sending"}>
      {envio.status === "sending" ? <><Loader2 size={16} className="erp-spin" /> Enviando...</> : <>{label}<ChevronRight size={16} /></>}
    </button>
  );
}

function ErrorLine({ envio }: { envio: Envio }) {
  return envio.status === "error" ? <div className="erp-form-error" role="alert">{envio.error}</div> : null;
}

function PublicPortal() {
  const [menuOpen, setMenuOpen] = useState(false);
  return <div className="public-portal"><header className="portal-header"><Link href="/"><img src="/tenant/wamovale-logo.jpg" alt="Wamovale" /></Link><MenuToggle open={menuOpen} onToggle={() => setMenuOpen(!menuOpen)} /><nav id="public-nav" className={menuOpen ? "public-nav--open" : undefined} onClick={() => setMenuOpen(false)}><Link href="/quem-somos">Quem somos</Link><Link href="/produtos">Produtos</Link><Link href="/moldes-e-ferramentaria">Projetos e engenharia</Link><Link className="portal-career-link" href="/trabalhe-conosco">Trabalhe conosco</Link><Link className="portal-login-link" href="/erp"><LogIn size={15} /> Área do colaborador</Link></nav></header><section className="portal-human"><div className="portal-human__image"><img src="/tenant/wamovale-human-banner.png" alt="Pessoas em uma conversa sobre soluções e produtos da Wamovale" /></div><div className="portal-human__copy"><span className="portal-kicker">Gente que entende gente</span><h2>Antes de falar de peça, a gente quer entender você.</h2><p>Na Wamovale, cada projeto começa com uma conversa. Nossa equipe escuta o desafio, conhece a rotina do seu negócio e constrói o próximo passo junto com você.</p><p>Porque uma boa solução técnica também precisa caber na vida real de quem vai usar, produzir e confiar nela.</p><Link className="button button--portal" href="/contato">Conversar com a nossa equipe <ChevronRight size={15} /></Link></div></section><main className="portal-main"><div className="portal-copy"><span className="portal-kicker">Wamovale · Transformação de termoplásticos</span><h1>Ideias que ganham forma em <em>plástico.</em></h1><p>Peças injetadas, tampas, moldes, matéria-prima e pigmentação para transformar projetos em produtos de qualidade.</p><div className="portal-actions"><Link className="button button--portal" href="/cotacao"><span>Solicitar orçamento</span><ChevronRight size={16} /></Link><Link className="portal-secondary-link" href="/produtos">Conhecer produtos <ChevronRight size={16} /></Link></div></div><div className="portal-visual"><div className="portal-orbit portal-orbit--one" /><div className="portal-orbit portal-orbit--two" /><div className="portal-card portal-card--main"><span className="portal-card__label">Soluções sob medida</span><strong>Peças injetadas<br />para o seu projeto</strong><div className="portal-card__line"><span /><b>+20 anos</b><small>de experiência</small></div><div className="portal-card__line"><span /><b>6 setores</b><small>aeronáutico · automotivo · construção · alimentício · cosmético · industrial</small></div></div><div className="portal-card portal-card--float"><span>✓</span><div><b>Qualidade e inovação</b><small>Da ideia ao produto final</small></div></div></div></main><section className="portal-services"><Link className="portal-service-link" href="/injecao-plastica"><span>01</span><b>Injeção plástica <ChevronRight size={14} /></b><small>Termoplásticos para diferentes aplicações</small></Link><Link className="portal-service-link" href="/moldes-e-ferramentaria"><span>02</span><b>Projetos e engenharia <ChevronRight size={14} /></b><small>Do projeto ao molde, com apoio técnico</small></Link><Link className="portal-service-link" href="/produtos"><span>03</span><b>Tampas e embalagens <ChevronRight size={14} /></b><small>Soluções para alimentos e outros mercados</small></Link></section><section className="portal-capabilities"><div className="portal-capabilities__heading"><span className="portal-kicker">Da engenharia ao produto final</span><h2>Uma solução completa para cada projeto.</h2><p>Conhecimento técnico para escolher materiais, desenvolver moldes e entregar peças consistentes.</p></div><div className="capability-grid"><article><span><Wrench size={17} /></span><h3>Projetos, moldes e ferramentaria</h3><p>Desenvolvimento, manutenção, ajustes e usinagem para garantir precisão e repetibilidade.</p><Link href="/cotacao">Falar sobre meu molde <ChevronRight size={14} /></Link></article><article><span><Boxes size={17} /></span><h3>Matéria-prima</h3><p>Seleção de resinas termoplásticas conforme aplicação, desempenho e requisito do produto.</p><Link href="/cotacao">Orientar meu projeto <ChevronRight size={14} /></Link></article><article><span><Sparkles size={17} /></span><h3>Pigmentos e acabamento</h3><p>Padronização de cor, masterbatch e acabamento alinhados ao projeto da sua embalagem.</p><Link href="/cotacao">Consultar padrão de cor <ChevronRight size={14} /></Link></article><article><span><ShieldCheck size={17} /></span><h3>Qualidade e rastreabilidade</h3><p>Controle dimensional, inspeção e acompanhamento para entregar segurança em cada lote.</p><Link href="/cotacao">Conhecer o processo <ChevronRight size={14} /></Link></article></div></section><section className="portal-segments"><div className="portal-segments__heading"><span className="portal-kicker">Experiência que atravessa mercados</span><h2>Projetos que precisam funcionar no mundo real.</h2><p>Conhecimento em transformação de termoplásticos para diferentes desafios, volumes e aplicações.</p></div><div className="portal-segment-grid"><article><b>Aeronáutico</b><small>Precisão, leveza e controle para aplicações exigentes.</small></article><article><b>Automotivo</b><small>Componentes consistentes para ciclos e escala industrial.</small></article><article><b>Construção civil</b><small>Peças resistentes para sistemas e instalações.</small></article><article><b>Alimentício</b><small>Embalagens e fechamentos pensados para segurança e uso.</small></article><article><b>Cosmético</b><small>Acabamento, cor e apresentação que valorizam o produto.</small></article><article><b>Industrial</b><small>Soluções técnicas para projetos especiais e recorrentes.</small></article></div></section><PublicFooter /></div>;
}
const HR_EMAIL = "rh@wamovale.com.br";

const institutionalPages: Record<string, { kicker: string; title: string; intro: string; image?: string; imageAlt?: string; cards: { title: string; description: string }[] }> = {
  "/quem-somos": { kicker: "A Wamovale", image: "/tenant/wamovale-quem-somos.png", imageAlt: "Imagem conceitual sobre pessoas, parceria e construção de soluções na Wamovale", title: "Experiência industrial que entrega confiança.", intro: "Uma empresa de transformação de termoplásticos que combina conhecimento técnico, ferramentaria e proximidade para transformar necessidades em soluções.", cards: [{ title: "Conhecimento técnico", description: "Experiência em injeção plástica, desenvolvimento de produtos e processos industriais." }, { title: "Parceria de longo prazo", description: "Atendimento próximo desde a ideia inicial até a produção recorrente." }, { title: "Valorização humana", description: "Pessoas, segurança e desenvolvimento como parte da qualidade entregue." }] },
  "/produtos": { kicker: "Produtos e aplicações", image: "/tenant/official/wamovale-produtos.png", imageAlt: "Imagem institucional de embalagens e aplicações publicada no site da Wamovale", title: "Peças pensadas para o seu mercado.", intro: "Tampas, frascos, potes e componentes injetados para projetos que exigem consistência, acabamento e escala.", cards: [{ title: "Tampas e fechamentos", description: "Soluções para embalagens, incluindo tampas flip-top e aplicações técnicas." }, { title: "Frascos e potes", description: "Peças para linhas alimentícias, cosméticas, industriais e outros mercados." }, { title: "Projetos sob medida", description: "Desenvolvimento a partir de desenho, amostra física ou referência." }] },
  "/injecao-plastica": { kicker: "Transformação de termoplásticos", title: "Da matéria-prima à peça pronta.", intro: "Processos de injeção organizados para entregar repetibilidade, produtividade e acabamento compatível com cada aplicação.", cards: [{ title: "Processo controlado", description: "Parâmetros, ciclos, cavidades e inspeções acompanhados por ordem de produção." }, { title: "Escala e recorrência", description: "Estrutura para lotes piloto, produção contínua e fornecimento programado." }, { title: "Aplicações diversas", description: "Atendimento a diferentes geometrias, materiais e requisitos de uso." }] },
  "/moldes-e-ferramentaria": { kicker: "Projetos e engenharia", image: "/tenant/wamovale-engenharia.png", imageAlt: "Profissionais analisando um molde de injeção plástica na fábrica", title: "Cada projeto começa com uma conversa.", intro: "Da primeira ideia ao molde e à peça final, nossa engenharia trabalha perto de quem precisa fazer acontecer.", cards: [{ title: "Desenvolvimento de moldes", description: "Apoio técnico para transformar a geometria do produto em uma solução fabricável." }, { title: "Manutenção e ajustes", description: "Preventivas, corretivas, insertos, lubrificação e controle de ciclos." }, { title: "Usinagem e melhoria", description: "Ferramentaria próxima da produção para reduzir paradas e preservar a repetibilidade." }] },
  "/materiais-e-pigmentos": { kicker: "Materiais e acabamento", title: "A matéria-prima certa para cada aplicação.", intro: "Seleção de resinas, aditivos, masterbatch e padrões de acabamento considerando desempenho, uso e processo.", cards: [{ title: "Resinas e aditivos", description: "Avaliação de materiais conforme resistência, transparência, contato com alimentos e aplicação." }, { title: "Pigmentação e masterbatch", description: "Padronização de cor e acabamento para manter consistência entre lotes." }, { title: "Rastreabilidade", description: "Lotes, validade, consumo e aprovação acompanhados desde o recebimento." }] },
  "/qualidade-institucional": { kicker: "Qualidade", title: "Consistência em cada lote.", intro: "Qualidade não é uma etapa isolada: está presente na matéria-prima, no molde, no processo e na peça entregue.", cards: [{ title: "Inspeção dimensional", description: "Conferência de medidas e características críticas conforme o projeto." }, { title: "Controle visual", description: "Acompanhamento de acabamento, cor, rebarba, manchas e defeitos." }, { title: "Liberação e histórico", description: "Registros para apoiar decisões, rastreabilidade e melhoria contínua." }] },
  "/contato": { kicker: "Vamos conversar", title: "Seu próximo projeto começa aqui.", intro: "Envie sua necessidade comercial ou técnica. A equipe direcionará o contato para quem pode ajudar.", cards: [{ title: "Projeto novo", description: "Use o formulário de cotação para compartilhar desenho, amostra, volume e material." }, { title: "Produção recorrente", description: "Conte sobre sua demanda, frequência, volumes e requisitos de fornecimento." }, { title: "Fale com a Wamovale", description: "Retornaremos pelo canal informado para entender o melhor próximo passo." }] },
};

function InstitutionalPage({ path }: { path: string }) {
  const page = institutionalPages[path] ?? institutionalPages["/quem-somos"];
  return <div className="public-form-page"><PublicHeader /><main className={`institutional-main ${page.image ? "" : "institutional-main--solo"}`}><div className="institutional-hero"><div className="institutional-intro"><span className="portal-kicker">{page.kicker}</span><h1>{page.title}</h1><p>{page.intro}</p><div className="portal-actions"><Link className="button button--portal" href="/cotacao">Solicitar orçamento <ChevronRight size={16} /></Link>{path === "/contato" ? <a className="portal-secondary-link" href="#contato-form">Ir para o formulário <ChevronRight size={16} /></a> : <Link className="portal-secondary-link" href="/contato">Falar com a equipe <ChevronRight size={16} /></Link>}</div></div>{page.image && <div className="institutional-visual"><img src={page.image} alt={page.imageAlt} /><span>Transformando ideias em soluções que fazem sentido.</span></div>}</div>{path === "/contato" && <ContactSection />}<div className="institutional-grid">{page.cards.map((card, index) => <article key={card.title}><span>0{index + 1}</span><h2>{card.title}</h2><p>{card.description}</p></article>)}</div></main><PublicFooter back /></div>;
}
function QuotePage() {
  const { envio, enviar, reset } = useEnvio();
  const [fileName, setFileName] = useState("");
  const [telError, setTelError] = useState<string | null>(null);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formEl = event.currentTarget;
    const form = new FormData(formEl);
    const tel = telefoneError(text(form, "telefone"));
    setTelError(tel);
    if (tel) { toast.error("Confira o telefone", { description: tel }); return; }
    try {
      const anexo = await fileToAnexo(form.get("anexo") as File | null);
      const ok = await enviar({
        tipo: "Cotação", nome: text(form, "nome"), empresa: text(form, "empresa"), email: text(form, "email"), telefone: text(form, "telefone") || undefined,
        necessidade: text(form, "necessidade"), etapa: text(form, "etapa"), volume: text(form, "volume"), material: text(form, "material"),
        mensagem: text(form, "mensagem") || undefined, consentimento: true, website: text(form, "website") || undefined, anexo,
      }, "Solicitação de cotação enviada");
      if (ok) { formEl.reset(); setFileName(""); }
    } catch (error) {
      toast.error("Anexo inválido", { description: errorMessage(error) });
    }
  };
  return <div className="public-form-page"><PublicHeader /><main className="public-form-main"><div className="public-form-intro"><span className="portal-kicker">Injeção plástica · Desenvolvimento industrial</span><h1>Tem um projeto de peça plástica?</h1><p>Conte o que você já sabe. Nossa equipe avalia a necessidade e identifica o melhor próximo passo para fabricação.</p><div className="form-trust"><span><CheckCircle2 size={15} /> Engenharia e ferramentaria própria</span><span><CheckCircle2 size={15} /> Atendimento para projetos novos e recorrentes</span><span><CheckCircle2 size={15} /> Arquivo técnico opcional no primeiro contato</span></div></div>
    {envio.status === "sent" ? <div className="lead-form"><Sent envio={envio} onReset={reset}>Nossa equipe comercial vai analisar o projeto e retornar pelo e-mail informado.</Sent></div> :
    <form className="lead-form" aria-label="Formulário de cotação" onSubmit={submit}><div className="lead-step"><span>1</span><div><b>O que você precisa?</b><small>Escolha a opção mais próxima do seu momento.</small></div></div><div className="choice-grid">{["Fabricar peças para meu produto", "Desenvolver uma peça nova", "Produzir com molde que já possuo", "Avaliar viabilidade ou transferir produção"].map((choice, index) => <label className="choice-card" key={choice}><input required type="radio" name="necessidade" value={choice} defaultChecked={index === 0} /><span>{choice}</span></label>)}</div><div className="lead-step"><span>2</span><div><b>Em que etapa está o projeto?</b><small>Isso ajuda a equipe a preparar a conversa certa.</small></div></div><div className="choice-grid choice-grid--three">{["Tenho desenho ou arquivo 3D", "Tenho uma amostra física", "Tenho apenas uma ideia ou referência"].map((choice, index) => <label className="choice-card" key={choice}><input required type="radio" name="etapa" value={choice} defaultChecked={index === 0} /><span>{choice}</span></label>)}</div>
      <div className="lead-fields"><label><span>Seu nome *</span><input name="nome" required minLength={2} placeholder="Nome e sobrenome" /></label><label><span>Empresa *</span><input name="empresa" required minLength={2} placeholder="Nome da empresa" /></label><label><span>E-mail corporativo *</span><input name="email" required type="email" placeholder="voce@empresa.com.br" /></label><label><span>Telefone (opcional)</span><TelefoneField error={telError} onInput={() => setTelError(null)} /></label><label><span>Volume estimado</span><select name="volume" defaultValue="Ainda estou avaliando"><option>Lote piloto ou pequenas quantidades</option><option>Produção recorrente em escala industrial</option><option>Ainda estou avaliando</option></select></label><label><span>Material da peça</span><select name="material" defaultValue="Preciso de orientação"><option>Já sei qual material preciso</option><option>Preciso de orientação</option></select></label><label className="lead-fields__full"><span>Conte mais sobre o projeto (opcional)</span><textarea name="mensagem" rows={3} maxLength={4000} placeholder="Aplicação, requisitos, prazos..." /></label></div>
      <label className="file-drop"><input type="file" name="anexo" accept=".pdf,.dwg,.dxf,.step,.stp,.jpg,.jpeg,.png" onChange={e => setFileName(e.target.files?.[0]?.name ?? "")} /><Upload size={19} /><span><b>{fileName || <>Anexar desenho, 3D ou referência <small>(opcional)</small></>}</b><small>PDF, DWG, DXF, STEP, JPG ou PNG · até 5 MB</small></span></label>
      <Consent>Autorizo a Wamovale a usar estes dados apenas para retorno comercial sobre este projeto.</Consent><Honeypot /><ErrorLine envio={envio} />
      <SubmitButton envio={envio} label="Enviar projeto para cotação" /><small className="form-privacy">Seus dados serão usados apenas para retorno comercial sobre este projeto.</small></form>}
  </main><PublicFooter back /></div>;
}

function CareersPage() {
  const { envio, enviar, reset } = useEnvio();
  const [fileName, setFileName] = useState("");
  const [telError, setTelError] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formEl = event.currentTarget;
    const form = new FormData(formEl);
    // N06: sem currículo ou telefone inválido → mensagem visível junto ao campo + aviso
    const tel = telefoneError(text(form, "telefone"));
    const file = form.get("curriculo") as File | null;
    const missingFile = !file || file.size === 0 ? "Anexe o currículo (PDF, DOC ou DOCX, até 5 MB)." : null;
    setTelError(tel);
    setFileError(missingFile);
    if (tel || missingFile) {
      toast.error(missingFile ? "Selecione o currículo" : "Confira o telefone", { description: [missingFile, tel].filter(Boolean).join(" ") });
      (formEl.querySelector(missingFile ? ".resume-upload" : 'input[name="telefone"]') as HTMLElement | null)?.scrollIntoView({ block: "center" });
      return;
    }
    try {
      const anexo = await fileToAnexo(file);
      if (!anexo) return;
      const ok = await enviar({ tipo: "Currículo", nome: text(form, "nome"), email: text(form, "email"), telefone: text(form, "telefone") || undefined, area: text(form, "area"), mensagem: text(form, "mensagem") || undefined, consentimento: true, website: text(form, "website") || undefined, anexo }, "Currículo enviado ao RH");
      if (ok) { formEl.reset(); setFileName(""); }
    } catch (error) {
      toast.error("Currículo inválido", { description: errorMessage(error) });
    }
  };
  return <div className="public-form-page"><PublicHeader /><main className="career-main"><div className="career-copy"><span className="portal-kicker">Pessoas que fazem acontecer</span><h1>Trabalhe conosco</h1><p>Quer fazer parte da Wamovale? Envie seu currículo e conte como você pode contribuir com nossa história de inovação, qualidade e valorização humana.</p><div className="career-highlights"><span><Users size={16} /> Ambiente industrial</span><span><Sparkles size={16} /> Aprendizado e desenvolvimento</span><span><ShieldCheck size={16} /> Respeito e segurança</span></div></div><div className="career-options">
    <section className="career-card career-card--primary"><span className="career-card-icon"><Upload size={18} /></span><h2>Enviar currículo</h2>
      {envio.status === "sent" ? <Sent envio={envio} onReset={reset}>Seu currículo chegou ao RH. Se não houver vaga aberta agora, ele fica no nosso banco de talentos.</Sent> :
      <form className="career-form" aria-label="Enviar currículo" onSubmit={submit}>
        <label className="modal-field"><span>Nome completo *</span><input name="nome" required minLength={2} /></label>
        <label className="modal-field"><span>E-mail *</span><input name="email" type="email" required /></label>
        <label className="modal-field"><span>Telefone (opcional)</span><TelefoneField error={telError} onInput={() => setTelError(null)} /></label>
        <label className="modal-field"><span>Área de interesse *</span><select name="area" required defaultValue=""><option value="" disabled>Selecione</option><option>Produção / operação de injetoras</option><option>Ferramentaria e manutenção</option><option>Qualidade</option><option>Logística e almoxarifado</option><option>Administrativo e comercial</option><option>Outra</option></select></label>
        <label className="modal-field"><span>Mensagem (opcional)</span><textarea name="mensagem" rows={2} maxLength={4000} /></label>
        <label className={`resume-upload${fileError ? " resume-upload--error" : ""}`}><input type="file" name="curriculo" accept=".pdf,.doc,.docx" aria-label="Currículo (obrigatório)" aria-invalid={fileError ? true : undefined} aria-describedby={fileError ? "curriculo-erro" : undefined} onChange={e => { setFileName(e.target.files?.[0]?.name ?? ""); setFileError(null); }} /><Upload size={16} /><span>{fileName || "Selecionar currículo * (PDF, DOC ou DOCX, até 5 MB)"}</span></label>
        <FieldError id="curriculo-erro" message={fileError} />
        <Consent>Autorizo a Wamovale a usar meus dados apenas para processos seletivos.</Consent><Honeypot /><ErrorLine envio={envio} />
        <SubmitButton envio={envio} label="Enviar para o RH" />
      </form>}
      <small className="erp-muted">Prefere e-mail? Escreva para <a href={`mailto:${HR_EMAIL}?subject=Currículo%20-%20Trabalhe%20conosco%20Wamovale`}>{HR_EMAIL}</a>.</small>
    </section>
    <section className="career-card career-card--qr"><span className="career-card-icon"><QrCode size={18} /></span><h2>Enviar pelo celular</h2><p>Aponte a câmera do celular para o QR Code e envie seu currículo diretamente ao RH.</p><img className="career-qr" src="/tenant/qr-rh-wamovale.png" alt="QR Code para enviar currículo ao RH da Wamovale" /><small>Canal de RH: {HR_EMAIL}</small></section>
  </div></main><PublicFooter back note="Se não houver uma vaga aberta, seu currículo fica no nosso banco de talentos." /></div>;
}

/** Formulário e canais de contato em /contato (B19). */
function ContactSection() {
  const { envio, enviar, reset } = useEnvio();
  const [telError, setTelError] = useState<string | null>(null);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formEl = event.currentTarget;
    const form = new FormData(formEl);
    const tel = telefoneError(text(form, "telefone"));
    setTelError(tel);
    if (tel) { toast.error("Confira o telefone", { description: tel }); return; }
    const ok = await enviar({ tipo: "Contato", nome: text(form, "nome"), empresa: text(form, "empresa") || undefined, email: text(form, "email"), telefone: text(form, "telefone") || undefined, assunto: text(form, "assunto"), mensagem: text(form, "mensagem"), consentimento: true, website: text(form, "website") || undefined }, "Mensagem enviada");
    if (ok) formEl.reset();
  };
  return (
    <section className="contact-section" id="contato-form">
      <div className="contact-channels">
        <h2>Canais da Wamovale</h2>
        <p><MapPin size={16} /> São José dos Campos · SP</p>
        <p><Mail size={16} /> Recursos Humanos: <a href={`mailto:${HR_EMAIL}`}>{HR_EMAIL}</a></p>
        <p><Boxes size={16} /> Projetos e orçamentos: <Link href="/cotacao">formulário de cotação</Link></p>
        <p><Wrench size={16} /> Retornamos pelo e-mail ou telefone que você informar.</p>
      </div>
      {envio.status === "sent" ? <div className="lead-form"><Sent envio={envio} onReset={reset}>A equipe vai direcionar sua mensagem para quem pode ajudar.</Sent></div> : (
        <form className="lead-form contact-form" aria-label="Formulário de contato" onSubmit={submit}>
          <div className="lead-fields">
            <label><span>Nome *</span><input name="nome" required minLength={2} /></label>
            <label><span>Empresa (opcional)</span><input name="empresa" /></label>
            <label><span>E-mail *</span><input name="email" type="email" required /></label>
            <label><span>Telefone (opcional)</span><TelefoneField error={telError} onInput={() => setTelError(null)} /></label>
            <label className="lead-fields__full"><span>Assunto *</span><select name="assunto" required defaultValue="Comercial"><option>Comercial</option><option>Produção recorrente</option><option>Suporte técnico</option><option>Fornecedor</option><option>Outro</option></select></label>
            <label className="lead-fields__full"><span>Mensagem *</span><textarea name="mensagem" required minLength={5} rows={4} maxLength={4000} /></label>
          </div>
          <Consent>Autorizo a Wamovale a usar estes dados para responder esta mensagem.</Consent><Honeypot /><ErrorLine envio={envio} />
          <SubmitButton envio={envio} label="Enviar mensagem" />
        </form>
      )}
    </section>
  );
}

export default function Home() {
  const [location] = useLocation();
  if (location === "/cotacao") return <QuotePage />;
  if (location === "/trabalhe-conosco") return <CareersPage />;
  if (institutionalPages[location]) return <InstitutionalPage path={location} />;
  return <PublicPortal />;
}

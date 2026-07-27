import { env } from "../env.js";

/**
 * Geração de criativos por IA.
 *
 * Usa o fal.ai como agregador: uma única conta e uma única chave dão
 * acesso a dezenas de modelos (imagem e vídeo). Trocar de modelo vira
 * mudar um parâmetro, não escrever outra integração.
 *
 * Sem chave configurada, o sistema não quebra: devolve um erro claro
 * dizendo o que falta.
 */

const FAL_URL = "https://fal.run";

export const isIaConfigurada = Boolean(env.FAL_KEY);

/** Proporções mais usadas em anúncio. */
export const FORMATOS = {
  feed_quadrado: { largura: 1024, altura: 1024, proporcao: "square_hd" },
  feed_vertical: { largura: 1024, altura: 1280, proporcao: "portrait_4_3" },
  story: { largura: 1024, altura: 1820, proporcao: "portrait_16_9" },
  paisagem: { largura: 1820, altura: 1024, proporcao: "landscape_16_9" },
  outro: { largura: 1024, altura: 1024, proporcao: "square_hd" },
} as const;

export type Formato = keyof typeof FORMATOS;

/**
 * Modelos escolhidos por caso de uso.
 *
 * `texto_na_imagem` é destaque à parte porque é a maior fraqueza da IA
 * generativa: a maioria dos modelos erra letras. Quando o anúncio
 * precisa de preço ou chamada escrita, vale usar o modelo certo.
 */
export const MODELOS = {
  imagem_rapida: {
    id: "fal-ai/flux/schnell",
    rotulo: "Rápido e barato",
    descricao: "Boa qualidade em poucos segundos. Ideal para testar ideias.",
    custoAprox: 0.003,
  },
  imagem_qualidade: {
    id: "fal-ai/flux-pro/v1.1",
    rotulo: "Alta qualidade",
    descricao: "Melhor acabamento fotográfico. Para a peça final.",
    custoAprox: 0.04,
  },
  texto_na_imagem: {
    id: "fal-ai/ideogram/v2",
    rotulo: "Com texto escrito",
    descricao: "O único que escreve texto legível na imagem (preço, chamada).",
    custoAprox: 0.08,
  },
  video: {
    id: "fal-ai/kling-video/v1.6/standard/text-to-video",
    rotulo: "Vídeo curto",
    descricao: "Gera vídeo de alguns segundos a partir do texto.",
    custoAprox: 0.25,
  },
} as const;

export type ChaveModelo = keyof typeof MODELOS;

export class IaError extends Error {
  constructor(
    message: string,
    readonly detalhe?: unknown,
  ) {
    super(message);
    this.name = "IaError";
  }
}

interface RespostaFal {
  images?: { url: string; width?: number; height?: number }[];
  video?: { url: string };
  error?: string;
  detail?: unknown;
}

export interface ResultadoGeracao {
  url: string;
  largura?: number;
  altura?: number;
  modelo: string;
  custoAprox: number;
}

/**
 * Gera um criativo.
 *
 * Retorna a URL temporária do provedor — quem chama é responsável por
 * baixar e guardar no nosso armazenamento, senão o arquivo some.
 */
export async function gerarCriativo(params: {
  modelo: ChaveModelo;
  prompt: string;
  promptNegativo?: string;
  formato: Formato;
}): Promise<ResultadoGeracao> {
  if (!env.FAL_KEY) {
    throw new IaError(
      "Geração por IA não configurada. Defina FAL_KEY no .env (conta em fal.ai).",
    );
  }

  const modelo = MODELOS[params.modelo];
  const formato = FORMATOS[params.formato];
  const ehVideo = params.modelo === "video";

  const corpo: Record<string, unknown> = ehVideo
    ? { prompt: params.prompt, duration: "5", aspect_ratio: "9:16" }
    : {
        prompt: params.prompt,
        image_size: formato.proporcao,
        num_images: 1,
        ...(params.promptNegativo ? { negative_prompt: params.promptNegativo } : {}),
      };

  const res = await fetch(`${FAL_URL}/${modelo.id}`, {
    method: "POST",
    headers: {
      Authorization: `Key ${env.FAL_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(corpo),
  });

  const dados = (await res.json().catch(() => ({}))) as RespostaFal;

  if (!res.ok) {
    throw new IaError(dados.error ?? `falha na geração (${res.status})`, dados.detail);
  }

  const url = dados.images?.[0]?.url ?? dados.video?.url;
  if (!url) {
    throw new IaError("o provedor não devolveu nenhum arquivo");
  }

  return {
    url,
    largura: dados.images?.[0]?.width,
    altura: dados.images?.[0]?.height,
    modelo: modelo.id,
    custoAprox: modelo.custoAprox,
  };
}

/**
 * Monta o prompt a partir do briefing do cliente.
 *
 * É isto que separa "imagem genérica de IA" de "peça que conversa com o
 * negócio": o modelo recebe o que a empresa faz, para quem vende e —
 * principalmente — o que NÃO pode aparecer.
 */
export function montarPrompt(params: {
  pedido: string;
  briefing?: {
    nome?: string;
    segmento?: string;
    descricao?: string;
    publico_alvo?: string;
    proposta_valor?: string;
    restricoes?: string;
  } | null;
}): { prompt: string; promptNegativo: string } {
  const b = params.briefing;
  const partes = [params.pedido.trim()];

  if (b?.segmento) partes.push(`Segmento: ${b.segmento}.`);
  if (b?.descricao) partes.push(`Sobre o negócio: ${b.descricao}`);
  if (b?.publico_alvo) partes.push(`Público: ${b.publico_alvo}`);
  if (b?.proposta_valor) partes.push(`Diferencial a transmitir: ${b.proposta_valor}`);

  partes.push(
    "Estilo: fotografia publicitária profissional, iluminação natural, alta nitidez.",
  );

  // O negativo carrega as restrições do cliente. Sem isso, a IA sugere
  // coisas que reprovam no Meta ou criam problema jurídico.
  const negativos = [
    "texto ilegível, letras distorcidas",
    "marca d'água, logotipo de terceiros",
    "imagem de baixa qualidade, desfocada",
  ];
  if (b?.restricoes) negativos.push(b.restricoes);

  return {
    prompt: partes.join(" "),
    promptNegativo: negativos.join(", "),
  };
}

'use client';

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { MessageSquare, Send, Headset, PhoneCall } from 'lucide-react';

type ChatMessage = {
  id: number;
  role: 'assistant' | 'user';
  content: string;
};

type AssistantApiResponse = {
  reply?: string;
  error?: string;
};

const ASSISTANT_BADGE_SEEN_KEY = 'djiguiflow_assistant_badge_seen';
const ASSISTANT_FLOATING_OPEN_KEY = 'djiguiflow_assistant_floating_open';
const SUPPORT_EMAIL = 'support@djiguiflow.com';

const quickPrompts = [
  'Comment fonctionne DjiguiFlow ?',
  'Quels sont les frais et les tarifs ?',
  'Comment se passent les paiements ?',
  'Comment créer ma boutique ?',
] as const;

const assistantReplies: Record<string, string> = {
  fonctionnement:
    "DjiguiFlow centralise votre boutique, les commandes, les livreurs, les paiements et les notifications dans un seul espace. Le client commande, l'assistant assiste, et votre équipe garde la main sur le suivi.",
  frais:
    "Les frais dépendent du plan choisi. Vous pouvez commencer avec un plan Starter, monter sur Pro pour plus d'automatisation, ou aller sur Premium pour une personnalisation complète. Si vous voulez, je peux vous résumer les différences.",
  paiement:
    "Les paiements sont pensés pour le terrain: Mobile Money, carte bancaire et suivi des transactions. L'idée est de simplifier la confirmation, d'éviter les ambiguïtés et de sécuriser le flux de vente.",
  boutique:
    "Créer votre boutique se fait depuis l'espace commerçant. Vous renseignez vos informations, ajoutez vos produits, puis vous pouvez activer vos canaux de vente et vos livraisons.",
  support:
    "Je peux aussi vous guider sur les commandes, les livreurs, les notifications, les produits ou les réglages. Posez simplement votre question.",
};

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim();
}

function buildFallbackReply(query: string): string {
  const message = normalizeText(query);

  if (message.includes('fonction') || message.includes('comment ca marche') || message.includes('comment marche')) {
    return assistantReplies.fonctionnement;
  }

  if (message.includes('frais') || message.includes('tarif') || message.includes('prix') || message.includes('abonnement')) {
    return assistantReplies.frais;
  }

  if (message.includes('paiement') || message.includes('payer') || message.includes('mobile money') || message.includes('carte')) {
    return assistantReplies.paiement;
  }

  if (message.includes('boutique') || message.includes('creer') || message.includes('inscrire') || message.includes('enregistrer')) {
    return assistantReplies.boutique;
  }

  if (message.includes('commande') || message.includes('livraison') || message.includes('livreur')) {
    return 'Pour les commandes, DjiguiFlow suit le cycle complet: réception, confirmation, assignation du livreur, puis notification au client. Cela permet de garder une expérience claire pour le commerçant et pour l’acheteur.';
  }

  if (message.includes('bonjour') || message.includes('salut')) {
    return 'Bonjour. Je peux vous expliquer le fonctionnement, les frais, les paiements ou la création de boutique. Choisissez une question ci-dessous ou écrivez la vôtre.';
  }

  return assistantReplies.support;
}

async function askAssistant(messages: ChatMessage[]): Promise<string | null> {
  try {
    const response = await fetch('/api/assistant', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: messages.map((message) => ({
          role: message.role,
          content: message.content,
        })),
      }),
    });

    const data = (await response.json()) as AssistantApiResponse;

    if (!response.ok) {
      return null;
    }

    return typeof data.reply === 'string' && data.reply.trim().length > 0 ? data.reply.trim() : null;
  } catch {
    return null;
  }
}

export default function AssistantChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 1,
      role: 'assistant',
      content: 'Bonjour ! Je suis votre assistant DjiguiFlow. Posez-moi une question sur le fonctionnement, les frais ou les paiements.',
    },
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isFloatingOpen, setIsFloatingOpen] = useState(() => {
    if (typeof window === 'undefined') {
      return false;
    }
    return window.localStorage.getItem(ASSISTANT_FLOATING_OPEN_KEY) === '1';
  });
  const [showLauncherBadge, setShowLauncherBadge] = useState(() => {
    if (typeof window === 'undefined') {
      return true;
    }
    return window.localStorage.getItem(ASSISTANT_BADGE_SEEN_KEY) !== '1';
  });
  const messageIdRef = useRef(2);
  const supportWhatsapp = process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP?.trim() ?? '';
  const supportPhone = process.env.NEXT_PUBLIC_SUPPORT_PHONE?.trim() ?? '';
  const supportText = encodeURIComponent('Bonjour, je souhaite parler a un conseiller DjiguiFlow.');
  const cleanedSupportPhone = supportPhone.replace(/[^\d+]/g, '');
  const supportHref = supportWhatsapp
    ? `https://wa.me/${supportWhatsapp.replace(/[^\d]/g, '')}?text=${supportText}`
    : `mailto:${SUPPORT_EMAIL}?subject=Besoin%20d%27un%20conseiller%20DjiguiFlow`;
  const callHref = cleanedSupportPhone ? `tel:${cleanedSupportPhone}` : null;
  const supportPhoneDisplay = supportPhone || cleanedSupportPhone;
  const supportMiniCtaLabel = supportWhatsapp ? 'WhatsApp' : 'Conseiller';

  const getNextMessageId = () => {
    const nextId = messageIdRef.current;
    messageIdRef.current += 1;
    return nextId;
  };

  const canSubmit = useMemo(() => input.trim().length > 0 && !isTyping, [input, isTyping]);

  const pushAssistantReply = (reply: string) => {
    setMessages((current) => [
      ...current,
      {
        id: getNextMessageId(),
        role: 'assistant',
        content: reply,
      },
    ]);
  };

  const handleSend = async (value: string) => {
    const trimmed = value.trim();
    if (!trimmed || isTyping) return;

    const userMessage: ChatMessage = {
      id: getNextMessageId(),
      role: 'user',
      content: trimmed,
    };

    const nextMessages = [...messages, userMessage];

    setMessages(nextMessages);
    setInput('');
    setIsTyping(true);

    const aiReply = await askAssistant(nextMessages);
    const fallbackReply = buildFallbackReply(trimmed);
    pushAssistantReply(aiReply ?? fallbackReply);
    setIsTyping(false);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    handleSend(input);
  };

  const setFloatingOpen = (next: boolean) => {
    setIsFloatingOpen(next);
    window.localStorage.setItem(ASSISTANT_FLOATING_OPEN_KEY, next ? '1' : '0');
  };

  const openFloatingAssistant = useCallback(() => {
    setShowLauncherBadge(false);
    window.localStorage.setItem(ASSISTANT_BADGE_SEEN_KEY, '1');
    setFloatingOpen(true);
  }, []);

  useEffect(() => {
    const handleOpenAssistant = () => {
      openFloatingAssistant();
    };

    window.addEventListener('djiguiflow:assistant-open', handleOpenAssistant);
    return () => {
      window.removeEventListener('djiguiflow:assistant-open', handleOpenAssistant);
    };
  }, [openFloatingAssistant]);

  const handleToggleFloating = () => {
    const next = !isFloatingOpen;
    if (next) {
      setShowLauncherBadge(false);
      window.localStorage.setItem(ASSISTANT_BADGE_SEEN_KEY, '1');
    }
    setFloatingOpen(next);
  };

  return (
    <>
      <div className="fixed bottom-6 right-6 z-[80] flex flex-col items-end gap-3">
        {isFloatingOpen && (
          <motion.div
            initial={{ opacity: 0, y: 18, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 18, scale: 0.96 }}
            className="w-[min(92vw,24rem)] overflow-hidden rounded-[1.5rem] border border-white/80 bg-white shadow-[0_24px_60px_rgba(49,35,20,0.20)] backdrop-blur-xl"
          >
            <div className="flex items-center justify-between border-b border-[var(--hairline)] bg-[linear-gradient(135deg,#fff9ef_0%,#eefaf4_100%)] px-4 py-3">
              <div>
                <p className="text-sm font-black text-nuit-900">Assistant IA</p>
                <p className="text-[11px] text-chaux-600">Infos, frais, paiements, support</p>
              </div>
              <button
                type="button"
                onClick={() => setFloatingOpen(false)}
                className="rounded-full border border-[var(--hairline)] bg-white px-2 py-1 text-xs font-bold text-chaux-600 transition hover:bg-chaux-50"
              >
                Fermer
              </button>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-mangue-100 bg-mangue-50/70 px-3 py-2">
              <p className="text-[11px] font-semibold text-mangue-700">
                Reponse IA generee
              </p>
              <div className="flex flex-wrap items-center gap-1.5">
                <a
                  href={supportHref}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded-full border border-mangue-200 bg-white px-2.5 py-1 text-[10px] font-bold text-mangue-700 transition hover:bg-mangue-100"
                >
                  <Headset className="h-3 w-3" />
                  {supportMiniCtaLabel}
                </a>
                {callHref && (
                  <div className="inline-flex items-center gap-1">
                    <a
                      href={callHref}
                      className="inline-flex items-center gap-1 rounded-full border border-[var(--hairline)] bg-white px-2.5 py-1 text-[10px] font-bold text-nuit-700 transition hover:bg-chaux-100"
                    >
                      <PhoneCall className="h-3 w-3" />
                      Appeler
                    </a>
                    {supportPhoneDisplay && (
                      <span className="rounded-full border border-[var(--hairline)] bg-white px-2 py-1 text-[10px] font-semibold text-chaux-600">
                        {supportPhoneDisplay}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="max-h-[50vh] space-y-3 overflow-y-auto p-4">
              {messages.map((message) => (
                <div
                  key={`floating-${message.id}`}
                  className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-6 ${
                    message.role === 'assistant' ? 'bg-chaux-100 text-nuit-700' : 'ml-auto bg-primary-100 text-primary-950'
                  }`}
                >
                  {message.content}
                </div>
              ))}

              {isTyping && (
                <div className="max-w-[84%] rounded-2xl bg-chaux-100 px-4 py-3 text-sm text-chaux-600">
                  L’assistant rédige une réponse...
                </div>
              )}
            </div>

            <div className="border-t border-[var(--hairline)] bg-white p-3">
              <div className="mb-3 flex flex-wrap gap-2">
                {quickPrompts.slice(0, 2).map((prompt) => (
                  <button
                    key={`floating-${prompt}`}
                    type="button"
                    onClick={() => handleSend(prompt)}
                    className="rounded-full border border-[var(--hairline)] bg-chaux-50 px-3 py-1.5 text-[11px] font-semibold text-chaux-600 transition hover:border-primary-300 hover:bg-primary-50 hover:text-primary-700"
                  >
                    {prompt}
                  </button>
                ))}
              </div>

              <form onSubmit={handleSubmit} className="flex items-center gap-2 rounded-[1rem] border border-[var(--hairline)] bg-chaux-50 p-2.5">
                <input
                  type="text"
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  placeholder="Posez votre question..."
                  className="flex-1 bg-transparent px-2 py-1.5 text-sm text-nuit-800 outline-none placeholder:text-chaux-600"
                />
                <button
                  type="submit"
                  disabled={!canSubmit}
                  className="inline-flex items-center gap-1 rounded-full bg-chaux-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-chaux-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Envoyer
                  <Send className="h-3.5 w-3.5" />
                </button>
              </form>
            </div>
          </motion.div>
        )}

        <button
          type="button"
          aria-label="Ouvrir l'assistant IA"
          onClick={handleToggleFloating}
          className="group relative inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-primary-600 to-accent-600 px-4 py-3 text-sm font-black text-white shadow-[0_16px_38px_rgba(217,119,6,0.35)] transition hover:-translate-y-0.5"
        >
          <MessageSquare className="h-5 w-5" />
          <span className="hidden sm:inline">Assistant IA</span>
          {showLauncherBadge && !isFloatingOpen && (
            <span className="absolute -right-1.5 -top-1.5 inline-flex h-6 min-w-6 items-center justify-center rounded-full border-2 border-white bg-bissap-500 px-1 text-[11px] font-black text-white shadow-lg shadow-bissap-500/35 animate-pulse">
              1
            </span>
          )}
        </button>
      </div>
    </>
  );
}

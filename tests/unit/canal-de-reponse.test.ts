import { describe, expect, it } from 'vitest';
import { canalDeReponse } from '@/lib/canaux';

/**
 * On repond au client par le canal ou il est venu.
 *
 * CE QUE CES TESTS PROTEGENT. `canal: 'whatsapp'` etait ecrit EN DUR dans la
 * route de statut. Mesure le 22 aout 2026 : huit commandes sur cinquante-sept
 * venaient de Telegram, et leurs clients recevaient leur suivi par WhatsApp.
 *
 * Pour une boutique qui n'a QUE Telegram, c'etait doublement absurde : on
 * detenait le `chat_id` du client, le marchand avait son bot — et on tentait un
 * canal qu'il n'a pas. Le canal en dur rendait injoignable un client
 * parfaitement joignable.
 */
describe('le canal de reponse au client', () => {
  it('repond sur Telegram a qui est venu par Telegram', () => {
    const r = canalDeReponse({ canal: 'telegram', chatId: 123456, telephone: '0700000000' });
    expect(r.canal).toBe('telegram');
    // L'ADRESSE EST LE CHAT, PAS LE TELEPHONE. Les confondre enverrait un
    // identifiant de conversation a un fournisseur WhatsApp.
    expect(r.destinataire).toBe('123456');
  });

  it('repond en WhatsApp a qui est venu par WhatsApp', () => {
    const r = canalDeReponse({ canal: 'whatsapp', chatId: 123456, telephone: '0700000000' });
    expect(r.canal).toBe('whatsapp');
    expect(r.destinataire).toBe('0700000000');
  });

  // Le client de la vitrine n'a jamais parle a un bot : il a laisse un NUMERO.
  // WhatsApp n'est pas un repli ici, c'est la seule adresse qu'on ait de lui.
  it('repond en WhatsApp au client de la vitrine', () => {
    const r = canalDeReponse({ canal: 'app', chatId: null, telephone: '0700000000' });
    expect(r.canal).toBe('whatsapp');
    expect(r.destinataire).toBe('0700000000');
  });

  it('repond en WhatsApp quand la commande ne sait pas d ou elle vient', () => {
    // Cinq commandes de juillet, anterieures a la colonne `canal`. Deviner
    // mieux qu'elles ne savent serait inventer.
    const r = canalDeReponse({ canal: null, chatId: 123456, telephone: '0700000000' });
    expect(r.canal).toBe('whatsapp');
  });

  // LE CAS QUI COMPTE LE PLUS. Un `canal` telegram SANS chat : on n'a pas
  // d'adresse Telegram. Rendre `telegram` avec un destinataire vide ferait
  // echouer l'envoi loin d'ici, sur un message illisible.
  it('retombe en WhatsApp si le canal dit Telegram mais qu il manque le chat', () => {
    const r = canalDeReponse({ canal: 'telegram', chatId: null, telephone: '0700000000' });
    expect(r.canal).toBe('whatsapp');
    expect(r.destinataire).toBe('0700000000');
  });

  it('ignore la casse et les espaces du canal', () => {
    expect(canalDeReponse({ canal: '  TELEGRAM ', chatId: 7, telephone: '07' }).canal).toBe(
      'telegram',
    );
  });

  it('ne rend jamais un destinataire non borne', () => {
    const r = canalDeReponse({ canal: 'whatsapp', chatId: null, telephone: null });
    expect(r.destinataire).toBe('');
  });
});

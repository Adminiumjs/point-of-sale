/**
 * French (Français) — fr-FR.
 *
 * Typed as `Record<MessageKey, string>` so the key set cannot drift from en.ts
 * — adding a key to en.ts breaks this file until it carries it too. Do not
 * rename or reorder the keys.
 *
 * The cafe's own content — menu item names, modifier names, table labels, staff
 * names, order numbers, the receipt's address — stays English on purpose, the
 * same way a real till shows whatever the operator typed into their catalogue.
 *
 * Plural messages use `|`-separated variants in this locale's CLDR category
 * order — for fr-FR that is `one|other`. See PLURAL_ORDER in ../index.tsx.
 */
import type { MessageKey } from './index';

export const fr: Record<MessageKey, string> = {
  // ---- shared chrome ----
  'common.cancel': 'Annuler',
  'common.clear': 'Effacer',
  'common.close': 'Fermer',
  'common.subtotal': 'Sous-total',
  'common.total': 'Total',
  'common.tip': 'Pourboire',
  'common.tax': 'TVA',
  'common.taxRate': 'TVA · {pct} %',
  'common.discount': 'Remise',
  'common.cash': 'Espèces',
  'common.card': 'Carte',
  'common.seatsCount': '{count} couvert|{count} couverts',
  'common.itemsCount': '{count} article|{count} articles',
  'common.minutesShort': '{m} min',
  'common.durationHm': '{h} h {m} min',
  'common.justNow': 'à l’instant',
  'common.minutesAgo': 'il y a {m} min',

  // ---- item options (the option *names* stay English; these are the labels) ----
  'size.small': 'Petit',
  'size.medium': 'Moyen',
  'size.large': 'Grand',
  'mod.milkSuffix': 'lait {milk}',

  // ---- table naming (the number is the cafe's; the noun is ours) ----
  'table.table': 'Table {n}',
  'table.window': 'Fenêtre {n}',
  'table.patio': 'Terrasse {n}',
  'table.bar': 'Bar {n}',
  'table.newTicket': 'Nouveau ticket',
  'table.walkIn': 'Vente au comptoir',

  // ---- floor zones ----
  'zone.window': 'Fenêtre',
  'zone.patio': 'Terrasse',
  'zone.bar': 'Bar',
  'zone.main': 'Salle',

  // ---- menu categories ----
  'category.all': 'Tout',
  'category.coffee': 'Café',
  'category.tea': 'Thé',
  'category.food': 'Plats',
  'category.bakery': 'Boulangerie',
  'category.cold': 'Boissons fraîches',

  // ---- staff roles ----
  'role.barista': 'Barista',
  'role.shiftlead': 'Chef d’équipe',

  // ---- demo dock ----
  'dock.title': 'Contrôles démo',
  'dock.screen.login': 'Connexion',
  'dock.screen.register': 'Caisse',
  'dock.screen.floor': 'Salle',
  'dock.screen.payment': 'Paiement',
  'dock.screen.complete': 'Reçu',
  'dock.screen.kitchen': 'Cuisine',
  'dock.emptyTicket': 'Ticket vide',
  'dock.resetTicket': 'Réinit. ticket',
  'dock.cardWillDecline': 'Carte : refusée',
  'dock.cardWillApprove': 'Carte : acceptée',
  'dock.newOrder': 'Nouvelle commande',
  'dock.autofillPin': 'Remplir le code',
  'dock.goOffline': 'Passer hors ligne',
  'dock.goOnline': 'Repasser en ligne',
  'dock.restaurant': 'Restaurant',
  'dock.retail': 'Boutique',
  'dock.toggleConnectivity': 'Basculer la connexion',
  'dock.toggleTheme': 'Changer de thème',
  'dock.language': 'Langue',

  // ---- top bar ----
  'topbar.subRetail': 'Ticket n° {n} · démarré il y a {d}',
  'topbar.subSeated': 'Ticket n° {n} · {seats} · ouvert depuis {d}',
  'topbar.subUnassigned': 'Ticket n° {n} · ouvert depuis {d}',
  'topbar.viewFloor': 'Voir la salle',
  'topbar.searchPlaceholder': 'Rechercher ou scanner un code-barres',
  'topbar.workingOffline': 'Mode hors ligne',
  'topbar.held': 'En attente',
  'topbar.shiftOpen': 'Ouvert depuis {d}',

  // ---- login / open shift ----
  'login.goodMorning': 'Bonjour',
  'login.goodAfternoon': 'Bon après-midi',
  'login.goodEvening': 'Bonsoir',
  'login.tapIn': '{greet} — pointez pour commencer votre service',
  'login.pinError': 'Code incorrect — réessayez',
  'login.pinPrompt': 'Saisissez le code à 4 chiffres de {name}',
  'login.backspace': 'Retour arrière',
  'login.countDrawer': 'Ouvrir le service · compter la caisse',
  'login.countDrawerHint':
    'Comptez les espèces du tiroir-caisse pour commencer le service. Ce montant devient le fonds de caisse initial.',
  'login.startingCash': 'Fonds de caisse',
  'login.drawerMinus': '−{amount}',
  'login.drawerPlus': '+{amount}',
  'login.openShift': 'Ouvrir le service',

  // ---- register ----
  'register.quickAdd': 'Ajout rapide',
  'register.soldOut': 'Épuisé',
  'register.hasOptions': 'Avec options',
  'register.densityComfortable': 'Confortable',
  'register.densityDense': 'Compact',

  // ---- floor ----
  'floor.title': 'Salle',
  'floor.legendOpen': 'Libre',
  'floor.legendOccupied': 'Occupée',
  'floor.legendAttention': 'Attention requise',
  'floor.seated': '{seated}/{total} assis',
  'floor.statusCurrent': 'En cours',
  'floor.statusOpen': 'Libre',
  'floor.statusOccupied': 'Occupée',
  'floor.statusAttention': 'Attention',
  'floor.openTicket': 'Ouvrir le ticket',
  'floor.tapToSeat': 'Appuyer pour installer',
  'floor.noteBillRequested': 'Addition demandée',
  'floor.noteSentAgo': 'Envoyé il y a {m} min',
  'floor.retailTitle': 'Mode boutique — pas de salle',
  'floor.retailBody':
    'En mode boutique, il n’y a ni tables ni tickets. Chaque vente se fait au comptoir : les articles sont ajoutés en caisse et vous encaissez immédiatement.',
  'floor.goToRegister': 'Aller à la caisse',

  // ---- ticket pane ----
  'ticket.subRetail': 'Ticket n° {n}',
  'ticket.subSeated': 'Ticket n° {n} · {seats}',
  'ticket.subUnassigned': 'Ticket n° {n} · non attribué',
  'ticket.shared': 'Partagé',
  'ticket.seatN': 'Couvert {n}',
  'ticket.noItems': 'Aucun article',
  'ticket.emptyHintRetail': 'Scannez ou sélectionnez des articles pour composer la vente.',
  'ticket.emptyHintTable': 'Touchez le menu pour ouvrir le ticket de {table}.',
  'ticket.seats': 'Couverts',
  'ticket.moveMerge': 'Déplacer / fusionner',
  'ticket.discountComp': 'Remise / offert',
  'ticket.sent': 'Envoyé',
  'ticket.increase': 'Ajouter un',
  'ticket.decrease': 'Retirer un',
  'ticket.removeLine': 'Supprimer l’article',
  'ticket.removeDiscount': 'Supprimer la remise',
  'ticket.hold': 'Attente',
  'ticket.send': 'Envoyer',
  'ticket.pay': 'Payer',

  // ---- modifier sheet ----
  'sheet.base': 'Base {amount}',
  'sheet.quantity': 'Quantité',
  'sheet.size': 'Taille',
  'sheet.milk': 'Lait',
  'sheet.extras': 'Suppléments',
  'sheet.seat': 'Couvert',
  'sheet.itemNote': 'Note sur l’article',
  'sheet.notePlaceholder': 'ex. très chaud, mousse d’avoine, sur place',
  'sheet.noCustomizations': 'Aucune personnalisation',
  'sheet.addToTicket': 'Ajouter {qty} au ticket',
  'sheet.close': 'Fermer les options',

  // ---- held tray ----
  'held.title': 'Tickets en attente',
  'held.empty': 'Aucun ticket en attente',
  'held.emptyHint': 'Mettez un ticket en attente pour le retrouver ici.',
  'held.for': 'en attente depuis {d}',
  'held.resume': 'Reprendre',

  // ---- void modal ----
  'void.title': 'Annuler cet article ?',
  'void.confirmOne': 'Annuler {name} ?',
  'void.confirmQty': 'Annuler {qty}× {name} ?',
  'void.body':
    'Cet article a déjà été envoyé en cuisine. Saisissez {word} pour confirmer et l’enregistrer sur le service.',
  'void.confirmButton': 'Annuler l’article',

  // ---- move / merge modal ----
  'move.title': 'Déplacer ou fusionner',
  'move.at': 'Ce ticket est à {table}.',
  'move.moveToOpen': 'Déplacer vers une table libre',
  'move.mergeHeld': 'Fusionner un ticket en attente avec celui-ci',

  // ---- discount modal ----
  'discount.title': 'Remises et offerts',
  'discount.pctOff': '{pct} % de remise',
  'discount.amountOff': '{amount} de remise',
  'discount.comp': 'Offert · 100 %',
  'discount.fullComp': 'Tout offrir',
  'discount.percentageOff': 'Remise en pourcentage',
  'discount.fixedAmount': 'Montant fixe',
  'discount.reason': 'Motif (enregistré sur le service)',
  'discount.reasonManager': 'Offert par le responsable',
  'discount.reasonLoyalty': 'Client fidèle',
  'discount.reasonRecovery': 'Geste commercial',
  'discount.reasonStaffMeal': 'Repas du personnel',
  'discount.reasonDamaged': 'Article abîmé',
  'discount.removeCurrent': 'Retirer · {label}',

  // ---- payment ----
  'payment.title': 'Paiement',
  'payment.back': 'Ticket',
  'payment.subtitle': 'Ticket n° {n} · {table}',
  'payment.declinedTitle': 'Carte refusée',
  'payment.declinedHint': 'Demandez une autre carte ou choisissez un autre moyen de paiement.',
  'payment.remainingBalance': 'Solde restant',
  'payment.balanceDue': 'Reste à payer',
  'payment.qr': 'QR',
  'payment.qrPay': 'Paiement QR',
  'payment.noTip': 'Sans pourboire',
  'payment.tipPct': '{pct} %',
  'payment.splitBill': 'Partager l’addition',
  'payment.splitEvenly': 'Partage égal',
  'payment.splitBadgeEven': 'Égal · {n} parts',
  'payment.splitBadgeAmount': 'Par montant · {amount}',
  'payment.ledger': 'Payeur {i} sur {n} · {amount} chacun',
  'payment.thisCharge': 'Ce paiement · {amount}',
  'payment.nWays': '{n} parts',
  'payment.guestsN': 'Clients {n}',
  'payment.each': '{amount} chacun',
  'payment.chargePart': 'Ou encaisser une partie du solde',
  'payment.tendered': 'Montant reçu',
  'payment.changeDue': 'Monnaie à rendre',
  'payment.exact': 'Appoint',
  'payment.cardWaiting': 'Insérer, approcher ou glisser',
  'payment.cardWaitingSub': 'Présentez la carte pour encaisser {amount}',
  'payment.cardReading': 'Lecture de la carte…',
  'payment.cardReadingSub': 'Laissez la carte en place',
  'payment.cardApproved': 'Acceptée',
  'payment.cardApprovedSub': 'Finalisation de la vente…',
  'payment.cardDeclinedSub': 'Essayez une autre carte ou un autre moyen',
  'payment.encrypted': 'Terminal chiffré · puce et sans contact',
  'payment.scanToPay': 'Scannez pour payer {amount}',
  'payment.qrHint': 'Pointez la caméra vers le code — Apple Pay, Google Pay ou tout autre portefeuille.',
  'payment.chargeReading': 'Lecture…',
  'payment.retryCard': 'Réessayer la carte',
  'payment.charge': 'Encaisser {amount}',
  'payment.enterCash': 'Saisir le montant reçu',
  'payment.addPartial': 'Ajouter {amount} · partiel',
  'payment.markPaid': 'Marquer payé {amount}',

  // ---- receipt / complete ----
  'complete.title': 'Paiement terminé',
  'complete.subtitle': 'Commande n° {n} · {table} · {time}',
  'complete.orderNo': 'Commande n° {n}',
  'complete.paidWith': 'Payé · {methods}',
  'complete.servedBy': 'Servi par {staff} · Merci !',
  'complete.printReceipt': 'Imprimer le reçu',
  'complete.email': 'E-mail',
  'complete.text': 'SMS',
  'complete.contactPlaceholder': 'client@email.com ou numéro de téléphone',
  'complete.newOrder': 'Nouvelle commande',
  'complete.backToFloor': 'Retour à la salle',

  // ---- kitchen display ----
  'kitchen.title': 'Écran cuisine',
  'kitchen.subtitle': '{brand} · tickets de commande en direct',
  'kitchen.register': 'Caisse',
  'kitchen.allDay': 'Total du jour',
  'kitchen.colNew': 'Nouveaux',
  'kitchen.colCooking': 'En cours',
  'kitchen.colReady': 'Prêts',
  'kitchen.bump': 'Valider',
  'kitchen.clearTicket': 'Effacer le ticket',

  // ---- toasts ----
  'toast.cardWillApprove': 'La carte sera acceptée',
  'toast.cardWillDecline': 'La carte sera refusée',
  'toast.retailNoTables': 'Mode boutique — pas de tables',
  'toast.shiftOpened': 'Service ouvert · Caisse {amount}',
  'toast.nothingToSend': 'Rien de nouveau à envoyer',
  'toast.orderSent': 'Commande envoyée en cuisine',
  'toast.ticketEmpty': 'Le ticket est vide',
  'toast.ticketHeld': 'Ticket mis en attente',
  'toast.resumed': 'Reprise de {table}',
  'toast.added': '{name} ajouté',
  'toast.itemVoided': 'Article annulé',
  'toast.movedTo': 'Déplacé vers {table}',
  'toast.merged': 'Fusion de {table}',
  'toast.comped': 'Offert · {label}',
  'toast.discounted': 'Remise · {label}',
  'toast.discountRemoved': 'Remise supprimée',
  'toast.addItemsFirst': 'Ajoutez d’abord des articles',
  'toast.seated': 'Installé à {table}',
  'toast.opened': 'Ouverture de {table}',
  'toast.enterCash': 'Saisissez le montant reçu',
  'toast.underShare': 'Inférieur à la part de {amount}',
  'toast.paidPartial': 'Payé {amount} · reste {rem}',
  'toast.paymentComplete': 'Paiement terminé · {amount}',
  'toast.cardDeclined': 'Carte refusée — essayez une autre carte',
  'toast.cardSharePaid': 'Part carte payée · reste {rem}',
  'toast.walletSharePaid': 'Part portefeuille payée · reste {rem}',
  'toast.printSent': 'Envoyé à l’imprimante',
  'toast.receiptSentEmail': 'Reçu envoyé par e-mail',
  'toast.receiptSentText': 'Reçu envoyé par SMS',
};

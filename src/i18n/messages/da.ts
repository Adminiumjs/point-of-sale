/**
 * Danish (Dansk) — da-DK.
 *
 * Typed as `Record<MessageKey, string>` so the key set cannot drift from en.ts
 * — adding a key to en.ts breaks this file until it carries it too. Do not
 * rename or reorder the keys.
 *
 * The cafe's own content — menu item names, modifier names ("Oat"), staff
 * names, order numbers — stays English, the same as in en.ts.
 *
 * Plural messages use `|`-separated variants in this locale's CLDR category
 * order — one, other — see PLURAL_ORDER in ../index.tsx.
 */
import type { MessageKey } from './index';

export const da: Record<MessageKey, string> = {
  // ---- shared chrome ----
  'common.cancel': 'Fortryd',
  'common.clear': 'Ryd',
  'common.close': 'Luk',
  'common.subtotal': 'Subtotal',
  'common.total': 'I alt',
  'common.tip': 'Drikkepenge',
  'common.tax': 'Moms',
  'common.taxRate': 'Moms · {pct}%',
  'common.discount': 'Rabat',
  'common.cash': 'Kontant',
  'common.card': 'Kort',
  'common.seatsCount': '{count} plads|{count} pladser',
  'common.itemsCount': '{count} vare|{count} varer',
  'common.minutesShort': '{m} min',
  'common.durationHm': '{h} t {m} min',
  'common.justNow': 'lige nu',
  'common.minutesAgo': 'for {m} min siden',

  // ---- item options (the option *names* stay English; these are the labels) ----
  'size.small': 'Lille',
  'size.medium': 'Mellem',
  'size.large': 'Stor',
  'mod.milkSuffix': '{milk} mælk',

  // ---- table naming (the number is the cafe's; the noun is ours) ----
  'table.table': 'Bord {n}',
  'table.window': 'Vindue {n}',
  'table.patio': 'Terrasse {n}',
  'table.bar': 'Bar {n}',
  'table.newTicket': 'Ny bon',
  'table.walkIn': 'Løssalg',

  // ---- floor zones ----
  'zone.window': 'Vindue',
  'zone.patio': 'Terrasse',
  'zone.bar': 'Bar',
  'zone.main': 'Sal',

  // ---- menu categories ----
  'category.all': 'Alle',
  'category.coffee': 'Kaffe',
  'category.tea': 'Te',
  'category.food': 'Mad',
  'category.bakery': 'Bagværk',
  'category.cold': 'Kolde drikke',

  // ---- staff roles ----
  'role.barista': 'Barista',
  'role.shiftlead': 'Vagtleder',

  // ---- demo dock ----
  'dock.title': 'Demokontroller',
  'dock.screen.login': 'Log ind',
  'dock.screen.register': 'Kasse',
  'dock.screen.floor': 'Bordplan',
  'dock.screen.payment': 'Betaling',
  'dock.screen.complete': 'Kvittering',
  'dock.screen.kitchen': 'Køkken',
  'dock.emptyTicket': 'Tom bon',
  'dock.resetTicket': 'Nulstil bon',
  'dock.cardWillDecline': 'Kort: afvises',
  'dock.cardWillApprove': 'Kort: godkendes',
  'dock.newOrder': 'Ny ordre',
  'dock.autofillPin': 'Udfyld PIN',
  'dock.goOffline': 'Gå offline',
  'dock.goOnline': 'Gå online',
  'dock.restaurant': 'Restaurant',
  'dock.retail': 'Butik',
  'dock.toggleConnectivity': 'Skift forbindelse',
  'dock.toggleTheme': 'Skift tema',
  'dock.language': 'Sprog',

  // ---- top bar ----
  'topbar.subRetail': 'Bon #{n} · startet for {d} siden',
  'topbar.subSeated': 'Bon #{n} · {seats} · åben {d}',
  'topbar.subUnassigned': 'Bon #{n} · åben {d}',
  'topbar.viewFloor': 'Vis bordplan',
  'topbar.searchPlaceholder': 'Søg i menu eller scan stregkode',
  'topbar.workingOffline': 'Arbejder offline',
  'topbar.held': 'Parkeret',
  'topbar.shiftOpen': 'Åben {d}',

  // ---- login / open shift ----
  'login.goodMorning': 'Godmorgen',
  'login.goodAfternoon': 'God eftermiddag',
  'login.goodEvening': 'Godaften',
  'login.tapIn': '{greet} — tjek ind for at starte vagten',
  'login.pinError': 'Forkert PIN — prøv igen',
  'login.pinPrompt': 'Indtast {name}s 4-cifrede PIN',
  'login.backspace': 'Slet',
  'login.countDrawer': 'Åbn vagt · tæl kassen',
  'login.countDrawerHint':
    'Tæl kontanterne i kassen for at starte vagten. Det bliver startbeholdningen.',
  'login.startingCash': 'Startbeholdning',
  'login.drawerMinus': '−{amount}',
  'login.drawerPlus': '+{amount}',
  'login.openShift': 'Åbn vagt',

  // ---- register ----
  'register.quickAdd': 'Hurtigvalg',
  'register.soldOut': 'Udsolgt',
  'register.hasOptions': 'Har tilvalg',
  'register.densityComfortable': 'Luftig',
  'register.densityDense': 'Kompakt',

  // ---- floor ----
  'floor.title': 'Bordplan',
  'floor.legendOpen': 'Ledig',
  'floor.legendOccupied': 'Optaget',
  'floor.legendAttention': 'Kræver opmærksomhed',
  'floor.seated': '{seated}/{total} optaget',
  'floor.statusCurrent': 'Aktiv',
  'floor.statusOpen': 'Ledig',
  'floor.statusOccupied': 'Optaget',
  'floor.statusAttention': 'Obs',
  'floor.openTicket': 'Åbn bon',
  'floor.tapToSeat': 'Tryk for at åbne',
  'floor.noteBillRequested': 'Regning ønsket',
  'floor.noteSentAgo': 'Sendt for {m} min siden',
  'floor.retailTitle': 'Butikstilstand — ingen bordplan',
  'floor.retailBody':
    'I butikstilstand er der hverken borde eller boner. Hvert salg er rent løssalg: varerne ryger på kassen, og du tager imod betaling med det samme.',
  'floor.goToRegister': 'Gå til kassen',

  // ---- ticket pane ----
  'ticket.subRetail': 'Bon #{n}',
  'ticket.subSeated': 'Bon #{n} · {seats}',
  'ticket.subUnassigned': 'Bon #{n} · uden bord',
  'ticket.shared': 'Fælles',
  'ticket.seatN': 'Plads {n}',
  'ticket.noItems': 'Ingen varer endnu',
  'ticket.emptyHintRetail': 'Scan eller tryk på varer for at oprette salget.',
  'ticket.emptyHintTable': 'Tryk på menuen for at starte {table}s bon.',
  'ticket.seats': 'Pladser',
  'ticket.moveMerge': 'Flyt / flet',
  'ticket.discountComp': 'Rabat / kulance',
  'ticket.sent': 'Sendt',
  'ticket.increase': 'Tilføj en',
  'ticket.decrease': 'Fjern en',
  'ticket.removeLine': 'Fjern vare',
  'ticket.removeDiscount': 'Fjern rabat',
  'ticket.hold': 'Parkér',
  'ticket.send': 'Send',
  'ticket.pay': 'Betal',

  // ---- modifier sheet ----
  'sheet.base': 'Grundpris {amount}',
  'sheet.quantity': 'Antal',
  'sheet.size': 'Størrelse',
  'sheet.milk': 'Mælk',
  'sheet.extras': 'Tilvalg',
  'sheet.seat': 'Plads',
  'sheet.itemNote': 'Varenote',
  'sheet.notePlaceholder': 'f.eks. ekstra varm, havreskum, spises her',
  'sheet.noCustomizations': 'Ingen tilvalg',
  'sheet.addToTicket': 'Tilføj {qty} til bon',
  'sheet.close': 'Luk tilvalg',

  // ---- held tray ----
  'held.title': 'Parkerede boner',
  'held.empty': 'Ingen parkerede boner',
  'held.emptyHint': 'Parkér en bon for at lægge den her.',
  'held.for': 'parkeret {d}',
  'held.resume': 'Genoptag',

  // ---- void modal ----
  'void.title': 'Annuller denne vare?',
  'void.confirmOne': 'Annuller {name}?',
  'void.confirmQty': 'Annuller {qty}× {name}?',
  'void.body':
    'Varen er allerede sendt til køkkenet. Skriv {word} for at bekræfte og registrere det på vagten.',
  'void.confirmButton': 'Annuller vare',

  // ---- move / merge modal ----
  'move.title': 'Flyt eller flet',
  'move.at': 'Denne bon hører til {table}.',
  'move.moveToOpen': 'Flyt til et ledigt bord',
  'move.mergeHeld': 'Flet en parkeret bon ind i denne',

  // ---- discount modal ----
  'discount.title': 'Rabat og kulance',
  'discount.pctOff': '{pct}% rabat',
  'discount.amountOff': '{amount} rabat',
  'discount.comp': 'Kulance · 100%',
  'discount.fullComp': 'Fuld kulance',
  'discount.percentageOff': 'Procentrabat',
  'discount.fixedAmount': 'Fast beløb',
  'discount.reason': 'Årsag (noteres på vagten)',
  'discount.reasonManager': 'Kulance fra leder',
  'discount.reasonLoyalty': 'Stamkunde',
  'discount.reasonRecovery': 'Kompensation',
  'discount.reasonStaffMeal': 'Personalemad',
  'discount.reasonDamaged': 'Beskadiget vare',
  'discount.removeCurrent': 'Fjern nuværende · {label}',

  // ---- payment ----
  'payment.title': 'Betaling',
  'payment.back': 'Bon',
  'payment.subtitle': 'Bon #{n} · {table}',
  'payment.declinedTitle': 'Kort afvist',
  'payment.declinedHint': 'Bed om et andet kort, eller vælg en anden metode.',
  'payment.remainingBalance': 'Restbeløb',
  'payment.balanceDue': 'At betale',
  'payment.qr': 'QR',
  'payment.qrPay': 'QR-betaling',
  'payment.noTip': 'Ingen',
  'payment.tipPct': '{pct}%',
  'payment.splitBill': 'Del regning',
  'payment.splitEvenly': 'Del ligeligt',
  'payment.splitBadgeEven': 'Ligeligt · {n} dele',
  'payment.splitBadgeAmount': 'Efter beløb · {amount}',
  'payment.ledger': 'Betaler {i} af {n} · {amount} hver',
  'payment.thisCharge': 'Denne betaling · {amount}',
  'payment.nWays': '{n} dele',
  'payment.guestsN': 'Gæster {n}',
  'payment.each': '{amount} hver',
  'payment.chargePart': 'Eller opkræv en del af beløbet',
  'payment.tendered': 'Modtaget',
  'payment.changeDue': 'Byttepenge',
  'payment.exact': 'Lige penge',
  'payment.cardWaiting': 'Indsæt, tap eller swipe',
  'payment.cardWaitingSub': 'Brug kortet for at opkræve {amount}',
  'payment.cardReading': 'Læser kort…',
  'payment.cardReadingSub': 'Lad kortet blive siddende',
  'payment.cardApproved': 'Godkendt',
  'payment.cardApprovedSub': 'Afslutter salget…',
  'payment.cardDeclinedSub': 'Prøv et andet kort eller en anden metode',
  'payment.encrypted': 'Krypteret terminal · chip og kontaktløs',
  'payment.scanToPay': 'Scan for at betale {amount}',
  'payment.qrHint': 'Ret kameraet mod koden — Apple Pay, Google Pay eller en anden wallet.',
  'payment.chargeReading': 'Læser…',
  'payment.retryCard': 'Prøv kort igen',
  'payment.charge': 'Opkræv {amount}',
  'payment.enterCash': 'Indtast modtaget kontant',
  'payment.addPartial': 'Tilføj {amount} · delvis',
  'payment.markPaid': 'Markér {amount} betalt',

  // ---- receipt / complete ----
  'complete.title': 'Betaling gennemført',
  'complete.subtitle': 'Ordre #{n} · {table} · {time}',
  'complete.orderNo': 'Ordre #{n}',
  'complete.paidWith': 'Betalt · {methods}',
  'complete.servedBy': 'Serveret af {staff} · Tak!',
  'complete.printReceipt': 'Print kvittering',
  'complete.email': 'E-mail',
  'complete.text': 'SMS',
  'complete.contactPlaceholder': 'gæst@email.com eller telefonnummer',
  'complete.newOrder': 'Ny ordre',
  'complete.backToFloor': 'Tilbage til bordplan',

  // ---- kitchen display ----
  'kitchen.title': 'Køkkenskærm',
  'kitchen.subtitle': '{brand} · live ordreboner',
  'kitchen.register': 'Kasse',
  'kitchen.allDay': 'I alt',
  'kitchen.colNew': 'Nye',
  'kitchen.colCooking': 'I gang',
  'kitchen.colReady': 'Klar',
  'kitchen.bump': 'Videre',
  'kitchen.clearTicket': 'Ryd bon',

  // ---- toasts ----
  'toast.cardWillApprove': 'Kortet godkendes',
  'toast.cardWillDecline': 'Kortet afvises',
  'toast.retailNoTables': 'Butikstilstand — ingen borde',
  'toast.shiftOpened': 'Vagt åbnet · Kasse {amount}',
  'toast.nothingToSend': 'Intet nyt at sende',
  'toast.orderSent': 'Ordre sendt til køkkenet',
  'toast.ticketEmpty': 'Bonen er tom',
  'toast.ticketHeld': 'Bon parkeret',
  'toast.resumed': '{table} genoptaget',
  'toast.added': '{name} tilføjet',
  'toast.itemVoided': 'Vare annulleret',
  'toast.movedTo': 'Flyttet til {table}',
  'toast.merged': '{table} flettet ind',
  'toast.comped': 'Kulance · {label}',
  'toast.discounted': 'Rabat · {label}',
  'toast.discountRemoved': 'Rabat fjernet',
  'toast.addItemsFirst': 'Tilføj varer først',
  'toast.seated': '{table} besat',
  'toast.opened': '{table} åbnet',
  'toast.enterCash': 'Indtast modtaget kontant',
  'toast.underShare': 'Under andelen på {amount}',
  'toast.paidPartial': 'Betalt {amount} · {rem} tilbage',
  'toast.paymentComplete': 'Betaling gennemført · {amount}',
  'toast.cardDeclined': 'Kort afvist — prøv et andet kort',
  'toast.cardSharePaid': 'Kortandel betalt · {rem} tilbage',
  'toast.walletSharePaid': 'Wallet-andel betalt · {rem} tilbage',
  'toast.printSent': 'Sendt til bonprinter',
  'toast.receiptSentEmail': 'Kvittering sendt på e-mail',
  'toast.receiptSentText': 'Kvittering sendt på SMS',
};

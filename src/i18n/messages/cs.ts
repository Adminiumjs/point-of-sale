/**
 * Czech (Čeština) — cs-CZ.
 *
 * Typed as `Record<MessageKey, string>` so the key set cannot drift from en.ts
 * — adding a key to en.ts breaks this file until it carries it too. Translate
 * values in place; do not rename or reorder the keys.
 *
 * Plural messages use `|`-separated variants in this locale's CLDR category
 * order — for cs-CZ that is one | few | other (see PLURAL_ORDER in ../index.tsx).
 *
 * The cafe's own content — menu items, modifier names, staff names, table
 * numbers — stays English on purpose, the same way a real till shows whatever
 * the operator typed into their catalogue.
 */
import type { MessageKey } from './index';

export const cs: Record<MessageKey, string> = {
  // ---- shared chrome ----
  'common.cancel': 'Zrušit',
  'common.clear': 'Vymazat',
  'common.close': 'Zavřít',
  'common.subtotal': 'Mezisoučet',
  'common.total': 'Celkem',
  'common.tip': 'Spropitné',
  'common.tax': 'DPH',
  'common.taxRate': 'DPH · {pct} %',
  'common.discount': 'Sleva',
  'common.cash': 'Hotovost',
  'common.card': 'Karta',
  'common.seatsCount': '{count} místo|{count} místa|{count} míst',
  'common.itemsCount': '{count} položka|{count} položky|{count} položek',
  'common.minutesShort': '{m} min',
  'common.durationHm': '{h} h {m} min',
  'common.justNow': 'právě teď',
  'common.minutesAgo': 'před {m} min',

  // ---- item options (the option *names* stay English; these are the labels) ----
  'size.small': 'Malé',
  'size.medium': 'Střední',
  'size.large': 'Velké',
  'mod.milkSuffix': '{milk} mléko',

  // ---- table naming (the number is the cafe's; the noun is ours) ----
  'table.table': 'Stůl {n}',
  'table.window': 'Okno {n}',
  'table.patio': 'Terasa {n}',
  'table.bar': 'Bar {n}',
  'table.newTicket': 'Nový účet',
  'table.walkIn': 'Přímý prodej',

  // ---- floor zones ----
  'zone.window': 'Okno',
  'zone.patio': 'Terasa',
  'zone.bar': 'Bar',
  'zone.main': 'Hlavní',

  // ---- menu categories ----
  'category.all': 'Vše',
  'category.coffee': 'Káva',
  'category.tea': 'Čaj',
  'category.food': 'Jídlo',
  'category.bakery': 'Pečivo',
  'category.cold': 'Studené nápoje',

  // ---- staff roles ----
  'role.barista': 'Barista',
  'role.shiftlead': 'Vedoucí směny',

  // ---- demo dock ----
  'dock.title': 'Ovládání dema',
  'dock.screen.login': 'Přihlášení',
  'dock.screen.register': 'Pokladna',
  'dock.screen.floor': 'Sál',
  'dock.screen.payment': 'Platba',
  'dock.screen.complete': 'Účtenka',
  'dock.screen.kitchen': 'Kuchyně',
  'dock.emptyTicket': 'Prázdný účet',
  'dock.resetTicket': 'Resetovat účet',
  'dock.cardWillDecline': 'Karta: zamítne se',
  'dock.cardWillApprove': 'Karta: schválí se',
  'dock.newOrder': 'Nová objednávka',
  'dock.autofillPin': 'Vyplnit PIN',
  'dock.goOffline': 'Přejít offline',
  'dock.goOnline': 'Přejít online',
  'dock.restaurant': 'Restaurace',
  'dock.retail': 'Maloobchod',
  'dock.toggleConnectivity': 'Přepnout připojení',
  'dock.toggleTheme': 'Přepnout motiv',
  'dock.language': 'Jazyk',

  // ---- top bar ----
  'topbar.subRetail': 'Účet č. {n} · začal před {d}',
  'topbar.subSeated': 'Účet č. {n} · {seats} · otevřen {d}',
  'topbar.subUnassigned': 'Účet č. {n} · otevřen {d}',
  'topbar.viewFloor': 'Zobrazit sál',
  'topbar.searchPlaceholder': 'Hledat v menu nebo naskenovat kód',
  'topbar.workingOffline': 'Režim offline',
  'topbar.held': 'Odloženo',
  'topbar.shiftOpen': 'Otevřeno {d}',

  // ---- login / open shift ----
  'login.goodMorning': 'Dobré ráno',
  'login.goodAfternoon': 'Dobré odpoledne',
  'login.goodEvening': 'Dobrý večer',
  'login.tapIn': '{greet} — přihlaste se a začněte směnu',
  'login.pinError': 'Nesprávný PIN — zkuste to znovu',
  'login.pinPrompt': 'Zadejte 4místný PIN pro {name}',
  'login.backspace': 'Smazat znak',
  'login.countDrawer': 'Otevřít směnu · spočítat kasu',
  'login.countDrawerHint':
    'Spočítejte hotovost v zásuvce a začněte směnu. Tato částka bude počáteční hotovost.',
  'login.startingCash': 'Počáteční hotovost',
  'login.drawerMinus': '−{amount}',
  'login.drawerPlus': '+{amount}',
  'login.openShift': 'Otevřít směnu',

  // ---- register ----
  'register.quickAdd': 'Rychlé přidání',
  'register.soldOut': 'Vyprodáno',
  'register.hasOptions': 'Má volby',
  'register.densityComfortable': 'Volné',
  'register.densityDense': 'Husté',

  // ---- floor ----
  'floor.title': 'Sál',
  'floor.legendOpen': 'Volný',
  'floor.legendOccupied': 'Obsazený',
  'floor.legendAttention': 'Vyžaduje pozornost',
  'floor.seated': '{seated}/{total} obsazeno',
  'floor.statusCurrent': 'Aktuální',
  'floor.statusOpen': 'Volný',
  'floor.statusOccupied': 'Obsazený',
  'floor.statusAttention': 'Pozornost',
  'floor.openTicket': 'Otevřít účet',
  'floor.tapToSeat': 'Klepnutím usadit',
  'floor.noteBillRequested': 'Žádost o účet',
  'floor.noteSentAgo': 'Odesláno před {m} min',
  'floor.retailTitle': 'Maloobchodní režim — bez sálu',
  'floor.retailBody':
    'V maloobchodním režimu nejsou stoly ani účty. Každý prodej je přímý: položky přidáte na pokladně a rovnou přijmete platbu.',
  'floor.goToRegister': 'Přejít na pokladnu',

  // ---- ticket pane ----
  'ticket.subRetail': 'Účet č. {n}',
  'ticket.subSeated': 'Účet č. {n} · {seats}',
  'ticket.subUnassigned': 'Účet č. {n} · nepřiřazeno',
  'ticket.shared': 'Společné',
  'ticket.seatN': 'Místo {n}',
  'ticket.noItems': 'Zatím žádné položky',
  'ticket.emptyHintRetail': 'Naskenujte nebo klepněte na položky a sestavte prodej.',
  'ticket.emptyHintTable': 'Klepnutím na menu založte účet pro {table}.',
  'ticket.seats': 'Místa',
  'ticket.moveMerge': 'Přesun / sloučení',
  'ticket.discountComp': 'Sleva / zdarma',
  'ticket.sent': 'Odesláno',
  'ticket.increase': 'Přidat jednu',
  'ticket.decrease': 'Ubrat jednu',
  'ticket.removeLine': 'Odebrat položku',
  'ticket.removeDiscount': 'Odebrat slevu',
  'ticket.hold': 'Odložit',
  'ticket.send': 'Odeslat',
  'ticket.pay': 'Zaplatit',

  // ---- modifier sheet ----
  'sheet.base': 'Základ {amount}',
  'sheet.quantity': 'Počet',
  'sheet.size': 'Velikost',
  'sheet.milk': 'Mléko',
  'sheet.extras': 'Doplňky',
  'sheet.seat': 'Místo',
  'sheet.itemNote': 'Poznámka k položce',
  'sheet.notePlaceholder': 'např. extra horké, ovesná pěna, na místě',
  'sheet.noCustomizations': 'Bez úprav',
  'sheet.addToTicket': 'Přidat {qty} na účet',
  'sheet.close': 'Zavřít volby',

  // ---- held tray ----
  'held.title': 'Odložené účty',
  'held.empty': 'Žádné odložené účty',
  'held.emptyHint': 'Odložený účet se zaparkuje zde.',
  'held.for': 'odloženo {d}',
  'held.resume': 'Obnovit',

  // ---- void modal ----
  'void.title': 'Stornovat tuto položku?',
  'void.confirmOne': 'Stornovat {name}?',
  'void.confirmQty': 'Stornovat {qty}× {name}?',
  'void.body':
    'Tato položka už byla odeslána do kuchyně. Pro potvrzení napište {word}; storno se zapíše na směnu.',
  'void.confirmButton': 'Stornovat položku',

  // ---- move / merge modal ----
  'move.title': 'Přesun nebo sloučení',
  'move.at': 'Tento účet je zde: {table}.',
  'move.moveToOpen': 'Přesunout na volný stůl',
  'move.mergeHeld': 'Sloučit odložený účet s tímto',

  // ---- discount modal ----
  'discount.title': 'Slevy a zdarma',
  'discount.pctOff': 'Sleva {pct} %',
  'discount.amountOff': 'Sleva {amount}',
  'discount.comp': 'Zdarma · 100 %',
  'discount.fullComp': 'Vše zdarma',
  'discount.percentageOff': 'Sleva v procentech',
  'discount.fixedAmount': 'Pevná částka',
  'discount.reason': 'Důvod (zapíše se na směnu)',
  'discount.reasonManager': 'Na účet vedoucího',
  'discount.reasonLoyalty': 'Věrnostní člen',
  'discount.reasonRecovery': 'Náprava služby',
  'discount.reasonStaffMeal': 'Jídlo pro personál',
  'discount.reasonDamaged': 'Poškozená položka',
  'discount.removeCurrent': 'Odebrat současnou · {label}',

  // ---- payment ----
  'payment.title': 'Platba',
  'payment.back': 'Účet',
  'payment.subtitle': 'Účet č. {n} · {table}',
  'payment.declinedTitle': 'Karta zamítnuta',
  'payment.declinedHint': 'Požádejte o jinou kartu nebo zvolte jiný způsob.',
  'payment.remainingBalance': 'Zbývá uhradit',
  'payment.balanceDue': 'K úhradě',
  'payment.qr': 'QR',
  'payment.qrPay': 'Platba QR',
  'payment.noTip': 'Bez spropitného',
  'payment.tipPct': '{pct} %',
  'payment.splitBill': 'Rozdělit účet',
  'payment.splitEvenly': 'Rozdělit rovným dílem',
  'payment.splitBadgeEven': 'Rovným dílem · {n}×',
  'payment.splitBadgeAmount': 'Podle částky · {amount}',
  'payment.ledger': 'Plátce {i} z {n} · po {amount}',
  'payment.thisCharge': 'Tato platba · {amount}',
  'payment.nWays': '{n}×',
  'payment.guestsN': 'Hostů: {n}',
  'payment.each': 'po {amount}',
  'payment.chargePart': 'Nebo naúčtujte část zůstatku',
  'payment.tendered': 'Přijato',
  'payment.changeDue': 'Vrátit',
  'payment.exact': 'Přesně',
  'payment.cardWaiting': 'Vložte, přiložte nebo protáhněte',
  'payment.cardWaitingSub': 'Přiložte kartu k platbě {amount}',
  'payment.cardReading': 'Načítání karty…',
  'payment.cardReadingSub': 'Nechte kartu na místě',
  'payment.cardApproved': 'Schváleno',
  'payment.cardApprovedSub': 'Dokončování prodeje…',
  'payment.cardDeclinedSub': 'Zkuste jinou kartu nebo jiný způsob',
  'payment.encrypted': 'Šifrovaný terminál · čip a bezkontaktně',
  'payment.scanToPay': 'Naskenujte a zaplaťte {amount}',
  'payment.qrHint': 'Namiřte fotoaparát na kód — Apple Pay, Google Pay nebo jiná peněženka.',
  'payment.chargeReading': 'Načítání…',
  'payment.retryCard': 'Zkusit kartu znovu',
  'payment.charge': 'Naúčtovat {amount}',
  'payment.enterCash': 'Zadejte přijatou hotovost',
  'payment.addPartial': 'Přidat {amount} · částečně',
  'payment.markPaid': 'Označit zaplaceno {amount}',

  // ---- receipt / complete ----
  'complete.title': 'Platba dokončena',
  'complete.subtitle': 'Objednávka č. {n} · {table} · {time}',
  'complete.orderNo': 'Objednávka č. {n}',
  'complete.paidWith': 'Zaplaceno · {methods}',
  'complete.servedBy': 'Obsloužil(a) {staff} · Děkujeme!',
  'complete.printReceipt': 'Vytisknout účtenku',
  'complete.email': 'E-mail',
  'complete.text': 'SMS',
  'complete.contactPlaceholder': 'host@email.com nebo telefonní číslo',
  'complete.newOrder': 'Nová objednávka',
  'complete.backToFloor': 'Zpět do sálu',

  // ---- kitchen display ----
  'kitchen.title': 'Kuchyňský displej',
  'kitchen.subtitle': '{brand} · živé objednávky',
  'kitchen.register': 'Pokladna',
  'kitchen.allDay': 'Celkem',
  'kitchen.colNew': 'Nové',
  'kitchen.colCooking': 'Připravuje se',
  'kitchen.colReady': 'Hotové',
  'kitchen.bump': 'Odbavit',
  'kitchen.clearTicket': 'Odstranit účet',

  // ---- toasts ----
  'toast.cardWillApprove': 'Karta bude schválena',
  'toast.cardWillDecline': 'Karta bude zamítnuta',
  'toast.retailNoTables': 'Maloobchodní režim — bez stolů',
  'toast.shiftOpened': 'Směna otevřena · Kasa {amount}',
  'toast.nothingToSend': 'Není co odeslat',
  'toast.orderSent': 'Objednávka odeslána do kuchyně',
  'toast.ticketEmpty': 'Účet je prázdný',
  'toast.ticketHeld': 'Účet odložen',
  'toast.resumed': 'Obnoveno: {table}',
  'toast.added': 'Přidáno: {name}',
  'toast.itemVoided': 'Položka stornována',
  'toast.movedTo': 'Přesunuto: {table}',
  'toast.merged': 'Sloučeno: {table}',
  'toast.comped': 'Zdarma · {label}',
  'toast.discounted': 'Sleva · {label}',
  'toast.discountRemoved': 'Sleva odebrána',
  'toast.addItemsFirst': 'Nejprve přidejte položky',
  'toast.seated': 'Usazeno: {table}',
  'toast.opened': 'Otevřeno: {table}',
  'toast.enterCash': 'Zadejte přijatou hotovost',
  'toast.underShare': 'Méně než podíl {amount}',
  'toast.paidPartial': 'Zaplaceno {amount} · zbývá {rem}',
  'toast.paymentComplete': 'Platba dokončena · {amount}',
  'toast.cardDeclined': 'Karta zamítnuta — zkuste jinou',
  'toast.cardSharePaid': 'Podíl kartou zaplacen · zbývá {rem}',
  'toast.walletSharePaid': 'Podíl peněženkou zaplacen · zbývá {rem}',
  'toast.printSent': 'Odesláno na tiskárnu účtenek',
  'toast.receiptSentEmail': 'Účtenka odeslána e-mailem',
  'toast.receiptSentText': 'Účtenka odeslána SMS',
};

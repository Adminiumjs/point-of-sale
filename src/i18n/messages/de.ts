/**
 * German (Deutsch) — de-DE.
 *
 * Typed as `Record<MessageKey, string>` so the key set cannot drift from en.ts
 * — adding a key to en.ts breaks this file until it carries it too. Do not
 * rename or reorder the keys.
 *
 * The cafe's own content — menu item names, modifier names, table labels, staff
 * names, order numbers, the receipt address — stays English on purpose, the way
 * a real till shows whatever the operator typed into their catalogue. Brand and
 * payment-network names (Adminium, Visa, Mastercard, Apple Pay, Google Pay) and
 * currency codes are likewise left alone.
 *
 * Plural messages use `|`-separated variants in this locale's CLDR category
 * order — for de-DE that is one|other. See PLURAL_ORDER in ../index.tsx.
 */
import type { MessageKey } from './index';

export const de: Record<MessageKey, string> = {
  // ---- shared chrome ----
  'common.cancel': 'Abbrechen',
  'common.clear': 'Leeren',
  'common.close': 'Schließen',
  'common.subtotal': 'Zwischensumme',
  'common.total': 'Gesamt',
  'common.tip': 'Trinkgeld',
  'common.tax': 'MwSt.',
  'common.taxRate': 'MwSt. · {pct} %',
  'common.discount': 'Rabatt',
  'common.cash': 'Bar',
  'common.card': 'Karte',
  'common.seatsCount': '{count} Platz|{count} Plätze',
  'common.itemsCount': '{count} Artikel|{count} Artikel',
  'common.minutesShort': '{m} Min.',
  'common.durationHm': '{h} Std. {m} Min.',
  'common.justNow': 'gerade eben',
  'common.minutesAgo': 'vor {m} Min.',

  // ---- item options (the option *names* stay English; these are the labels) ----
  'size.small': 'Klein',
  'size.medium': 'Mittel',
  'size.large': 'Groß',
  'mod.milkSuffix': '{milk}-Milch',

  // ---- table naming (the number is the cafe's; the noun is ours) ----
  'table.table': 'Tisch {n}',
  'table.window': 'Fenster {n}',
  'table.patio': 'Terrasse {n}',
  'table.bar': 'Bar {n}',
  'table.newTicket': 'Neuer Bon',
  'table.walkIn': 'Direktverkauf',

  // ---- floor zones ----
  'zone.window': 'Fenster',
  'zone.patio': 'Terrasse',
  'zone.bar': 'Bar',
  'zone.main': 'Hauptraum',

  // ---- menu categories ----
  'category.all': 'Alle',
  'category.coffee': 'Kaffee',
  'category.tea': 'Tee',
  'category.food': 'Speisen',
  'category.bakery': 'Backwaren',
  'category.cold': 'Kaltgetränke',

  // ---- staff roles ----
  'role.barista': 'Barista',
  'role.shiftlead': 'Schichtleitung',

  // ---- demo dock ----
  'dock.title': 'Demo-Steuerung',
  'dock.screen.login': 'Anmeldung',
  'dock.screen.register': 'Kasse',
  'dock.screen.floor': 'Tischplan',
  'dock.screen.payment': 'Zahlung',
  'dock.screen.complete': 'Beleg',
  'dock.screen.kitchen': 'Küche',
  'dock.emptyTicket': 'Leerer Bon',
  'dock.resetTicket': 'Bon zurücksetzen',
  'dock.cardWillDecline': 'Karte: Ablehnung',
  'dock.cardWillApprove': 'Karte: Freigabe',
  'dock.newOrder': 'Neue Bestellung',
  'dock.autofillPin': 'PIN einfügen',
  'dock.goOffline': 'Offline gehen',
  'dock.goOnline': 'Online gehen',
  'dock.restaurant': 'Restaurant',
  'dock.retail': 'Einzelhandel',
  'dock.toggleConnectivity': 'Verbindung umschalten',
  'dock.toggleTheme': 'Design umschalten',
  'dock.language': 'Sprache',

  // ---- top bar ----
  'topbar.subRetail': 'Bon #{n} · vor {d} begonnen',
  'topbar.subSeated': 'Bon #{n} · {seats} · offen {d}',
  'topbar.subUnassigned': 'Bon #{n} · offen {d}',
  'topbar.viewFloor': 'Tischplan ansehen',
  'topbar.searchPlaceholder': 'Karte durchsuchen oder Barcode scannen',
  'topbar.workingOffline': 'Offline-Modus',
  'topbar.held': 'Geparkt',
  'topbar.shiftOpen': 'Offen {d}',

  // ---- login / open shift ----
  'login.goodMorning': 'Guten Morgen',
  'login.goodAfternoon': 'Guten Tag',
  'login.goodEvening': 'Guten Abend',
  'login.tapIn': '{greet} — zum Schichtstart anmelden',
  'login.pinError': 'Falsche PIN — bitte erneut versuchen',
  'login.pinPrompt': '4-stellige PIN von {name} eingeben',
  'login.backspace': 'Rücktaste',
  'login.countDrawer': 'Schicht öffnen · Kasse zählen',
  'login.countDrawerHint':
    'Zählen Sie das Bargeld in der Kassenlade, um die Schicht zu starten. Das wird der Anfangsbestand.',
  'login.startingCash': 'Anfangsbestand',
  'login.drawerMinus': '−{amount}',
  'login.drawerPlus': '+{amount}',
  'login.openShift': 'Schicht öffnen',

  // ---- register ----
  'register.quickAdd': 'Schnellauswahl',
  'register.soldOut': 'Ausverkauft',
  'register.hasOptions': 'Mit Optionen',
  'register.densityComfortable': 'Locker',
  'register.densityDense': 'Kompakt',

  // ---- floor ----
  'floor.title': 'Tischplan',
  'floor.legendOpen': 'Frei',
  'floor.legendOccupied': 'Besetzt',
  'floor.legendAttention': 'Handlungsbedarf',
  'floor.seated': '{seated}/{total} besetzt',
  'floor.statusCurrent': 'Aktuell',
  'floor.statusOpen': 'Frei',
  'floor.statusOccupied': 'Besetzt',
  'floor.statusAttention': 'Achtung',
  'floor.openTicket': 'Bon öffnen',
  'floor.tapToSeat': 'Tippen zum Besetzen',
  'floor.noteBillRequested': 'Rechnung gewünscht',
  'floor.noteSentAgo': 'Vor {m} Min. gesendet',
  'floor.retailTitle': 'Einzelhandelsmodus — kein Tischplan',
  'floor.retailBody':
    'Im Einzelhandelsmodus gibt es keine Tische und keine Bons. Jeder Verkauf läuft direkt: Artikel kommen auf die Kasse und Sie kassieren sofort.',
  'floor.goToRegister': 'Zur Kasse',

  // ---- ticket pane ----
  'ticket.subRetail': 'Bon #{n}',
  'ticket.subSeated': 'Bon #{n} · {seats}',
  'ticket.subUnassigned': 'Bon #{n} · ohne Tisch',
  'ticket.shared': 'Geteilt',
  'ticket.seatN': 'Platz {n}',
  'ticket.noItems': 'Noch keine Artikel',
  'ticket.emptyHintRetail': 'Artikel scannen oder antippen, um den Verkauf zu erfassen.',
  'ticket.emptyHintTable': 'Karte antippen, um den Bon für {table} zu starten.',
  'ticket.seats': 'Plätze',
  'ticket.moveMerge': 'Umbuchen',
  'ticket.discountComp': 'Rabatt / gratis',
  'ticket.sent': 'Gesendet',
  'ticket.increase': 'Eins mehr',
  'ticket.decrease': 'Eins weniger',
  'ticket.removeLine': 'Artikel entfernen',
  'ticket.removeDiscount': 'Rabatt entfernen',
  'ticket.hold': 'Parken',
  'ticket.send': 'Senden',
  'ticket.pay': 'Zahlen',

  // ---- modifier sheet ----
  'sheet.base': 'Basis {amount}',
  'sheet.quantity': 'Menge',
  'sheet.size': 'Größe',
  'sheet.milk': 'Milch',
  'sheet.extras': 'Extras',
  'sheet.seat': 'Platz',
  'sheet.itemNote': 'Artikelnotiz',
  'sheet.notePlaceholder': 'z. B. extra heiß, Hafer-Schaum, im Haus',
  'sheet.noCustomizations': 'Keine Anpassungen',
  'sheet.addToTicket': '{qty} auf den Bon',
  'sheet.close': 'Optionen schließen',

  // ---- held tray ----
  'held.title': 'Geparkte Bons',
  'held.empty': 'Keine geparkten Bons',
  'held.emptyHint': 'Bon parken, um ihn hier abzulegen.',
  'held.for': 'seit {d} geparkt',
  'held.resume': 'Fortsetzen',

  // ---- void modal ----
  'void.title': 'Diesen Artikel stornieren?',
  'void.confirmOne': '{name} stornieren?',
  'void.confirmQty': '{qty}× {name} stornieren?',
  'void.body':
    'Dieser Artikel wurde bereits an die Küche gesendet. Geben Sie {word} ein, um zu bestätigen und die Stornierung auf der Schicht zu erfassen.',
  'void.confirmButton': 'Artikel stornieren',

  // ---- move / merge modal ----
  'move.title': 'Umbuchen oder zusammenlegen',
  'move.at': 'Dieser Bon liegt auf {table}.',
  'move.moveToOpen': 'Auf einen freien Tisch umbuchen',
  'move.mergeHeld': 'Einen geparkten Bon hier zusammenlegen',

  // ---- discount modal ----
  'discount.title': 'Rabatte & Gratis',
  'discount.pctOff': '{pct} % Rabatt',
  'discount.amountOff': '{amount} Rabatt',
  'discount.comp': 'Gratis · 100 %',
  'discount.fullComp': 'Komplett gratis',
  'discount.percentageOff': 'Prozentualer Rabatt',
  'discount.fixedAmount': 'Fester Betrag',
  'discount.reason': 'Grund (auf der Schicht protokolliert)',
  'discount.reasonManager': 'Manager-Kulanz',
  'discount.reasonLoyalty': 'Stammkunde',
  'discount.reasonRecovery': 'Wiedergutmachung',
  'discount.reasonStaffMeal': 'Personalessen',
  'discount.reasonDamaged': 'Beschädigter Artikel',
  'discount.removeCurrent': 'Aktuellen entfernen · {label}',

  // ---- payment ----
  'payment.title': 'Zahlung',
  'payment.back': 'Bon',
  'payment.subtitle': 'Bon #{n} · {table}',
  'payment.declinedTitle': 'Karte abgelehnt',
  'payment.declinedHint': 'Bitten Sie um eine andere Karte oder wählen Sie eine andere Methode.',
  'payment.remainingBalance': 'Restbetrag',
  'payment.balanceDue': 'Offener Betrag',
  'payment.qr': 'QR',
  'payment.qrPay': 'QR-Zahlung',
  'payment.noTip': 'Kein Trinkgeld',
  'payment.tipPct': '{pct} %',
  'payment.splitBill': 'Rechnung teilen',
  'payment.splitEvenly': 'Gleichmäßig teilen',
  'payment.splitBadgeEven': 'Gleich · {n} Teile',
  'payment.splitBadgeAmount': 'Nach Betrag · {amount}',
  'payment.ledger': 'Zahler {i} von {n} · je {amount}',
  'payment.thisCharge': 'Dieser Betrag · {amount}',
  'payment.nWays': '{n} Teile',
  'payment.guestsN': 'Gäste {n}',
  'payment.each': 'je {amount}',
  'payment.chargePart': 'Oder einen Teilbetrag kassieren',
  'payment.tendered': 'Gegeben',
  'payment.changeDue': 'Rückgeld',
  'payment.exact': 'Passend',
  'payment.cardWaiting': 'Stecken, auflegen oder ziehen',
  'payment.cardWaitingSub': 'Karte vorhalten, um {amount} zu buchen',
  'payment.cardReading': 'Karte wird gelesen…',
  'payment.cardReadingSub': 'Karte stecken lassen',
  'payment.cardApproved': 'Genehmigt',
  'payment.cardApprovedSub': 'Verkauf wird abgeschlossen…',
  'payment.cardDeclinedSub': 'Andere Karte oder andere Methode versuchen',
  'payment.encrypted': 'Verschlüsseltes Terminal · Chip & kontaktlos',
  'payment.scanToPay': 'Scannen und {amount} zahlen',
  'payment.qrHint': 'Kamera auf den Code richten — Apple Pay, Google Pay oder ein beliebiges Wallet.',
  'payment.chargeReading': 'Wird gelesen…',
  'payment.retryCard': 'Karte erneut',
  'payment.charge': '{amount} kassieren',
  'payment.enterCash': 'Gegebenen Betrag eingeben',
  'payment.addPartial': '{amount} · Teilzahlung',
  'payment.markPaid': '{amount} als bezahlt',

  // ---- receipt / complete ----
  'complete.title': 'Zahlung abgeschlossen',
  'complete.subtitle': 'Bestellung #{n} · {table} · {time}',
  'complete.orderNo': 'Bestellung #{n}',
  'complete.paidWith': 'Bezahlt · {methods}',
  'complete.servedBy': 'Bedient von {staff} · Vielen Dank!',
  'complete.printReceipt': 'Beleg drucken',
  'complete.email': 'E-Mail',
  'complete.text': 'SMS',
  'complete.contactPlaceholder': 'gast@email.com oder Telefonnummer',
  'complete.newOrder': 'Neue Bestellung',
  'complete.backToFloor': 'Zum Tischplan',

  // ---- kitchen display ----
  'kitchen.title': 'Küchendisplay',
  'kitchen.subtitle': '{brand} · Live-Bons',
  'kitchen.register': 'Kasse',
  'kitchen.allDay': 'Gesamt',
  'kitchen.colNew': 'Neu',
  'kitchen.colCooking': 'In Arbeit',
  'kitchen.colReady': 'Fertig',
  'kitchen.bump': 'Abhaken',
  'kitchen.clearTicket': 'Bon entfernen',

  // ---- toasts ----
  'toast.cardWillApprove': 'Karte wird genehmigt',
  'toast.cardWillDecline': 'Karte wird abgelehnt',
  'toast.retailNoTables': 'Einzelhandelsmodus — keine Tische',
  'toast.shiftOpened': 'Schicht geöffnet · Kasse {amount}',
  'toast.nothingToSend': 'Nichts Neues zu senden',
  'toast.orderSent': 'Bestellung an die Küche gesendet',
  'toast.ticketEmpty': 'Bon ist leer',
  'toast.ticketHeld': 'Bon geparkt',
  'toast.resumed': '{table} fortgesetzt',
  'toast.added': '{name} hinzugefügt',
  'toast.itemVoided': 'Artikel storniert',
  'toast.movedTo': 'Auf {table} umgebucht',
  'toast.merged': '{table} zusammengelegt',
  'toast.comped': 'Gratis · {label}',
  'toast.discounted': 'Rabatt · {label}',
  'toast.discountRemoved': 'Rabatt entfernt',
  'toast.addItemsFirst': 'Zuerst Artikel hinzufügen',
  'toast.seated': '{table} besetzt',
  'toast.opened': '{table} geöffnet',
  'toast.enterCash': 'Gegebenen Betrag eingeben',
  'toast.underShare': 'Unter dem Anteil von {amount}',
  'toast.paidPartial': '{amount} bezahlt · {rem} offen',
  'toast.paymentComplete': 'Zahlung abgeschlossen · {amount}',
  'toast.cardDeclined': 'Karte abgelehnt — andere Karte versuchen',
  'toast.cardSharePaid': 'Kartenanteil bezahlt · {rem} offen',
  'toast.walletSharePaid': 'Wallet-Anteil bezahlt · {rem} offen',
  'toast.printSent': 'An den Bondrucker gesendet',
  'toast.receiptSentEmail': 'Beleg per E-Mail gesendet',
  'toast.receiptSentText': 'Beleg per SMS gesendet',
};

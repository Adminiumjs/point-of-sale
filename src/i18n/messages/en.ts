/**
 * English source bundle — the authoritative key list.
 *
 * `MessageKey` is `keyof typeof en`, so every other locale is type-checked
 * against this file: adding a key here breaks the seven translations until they
 * carry it too, and a typo in a `t('…')` call is a compile error.
 *
 * Scope: UI chrome only. The cafe's own content — menu item names, modifier
 * names ("Oat", "Extra shot"), table labels, staff names, order numbers, the
 * receipt's address — is demo fiction and deliberately stays English, the same
 * way a real till would show whatever the operator typed into their catalogue.
 *
 * Plurals use the `|` convention documented in ../index.tsx: variants in the
 * locale's own CLDR category order, selected by the `count` argument.
 */
export const en = {
  // ---- shared chrome ----
  'common.cancel': 'Cancel',
  'common.clear': 'Clear',
  'common.close': 'Close',
  'common.subtotal': 'Subtotal',
  'common.total': 'Total',
  'common.tip': 'Tip',
  'common.tax': 'Tax',
  'common.taxRate': 'Tax · {pct}%',
  'common.discount': 'Discount',
  'common.cash': 'Cash',
  'common.card': 'Card',
  'common.seatsCount': '{count} seat|{count} seats',
  'common.itemsCount': '{count} item|{count} items',
  'common.minutesShort': '{m}m',
  'common.durationHm': '{h}h {m}m',
  'common.justNow': 'just now',
  'common.minutesAgo': '{m}m ago',

  // ---- item options (the option *names* stay English; these are the labels) ----
  'size.small': 'Small',
  'size.medium': 'Medium',
  'size.large': 'Large',
  'mod.milkSuffix': '{milk} milk',

  // ---- table naming (the number is the cafe's; the noun is ours) ----
  'table.table': 'Table {n}',
  'table.window': 'Window {n}',
  'table.patio': 'Patio {n}',
  'table.bar': 'Bar {n}',
  'table.newTicket': 'New ticket',
  'table.walkIn': 'Walk-in sale',

  // ---- floor zones ----
  'zone.window': 'Window',
  'zone.patio': 'Patio',
  'zone.bar': 'Bar',
  'zone.main': 'Main',

  // ---- menu categories ----
  'category.all': 'All',
  'category.coffee': 'Coffee',
  'category.tea': 'Tea',
  'category.food': 'Food',
  'category.bakery': 'Bakery',
  'category.cold': 'Cold Drinks',

  // ---- staff roles ----
  'role.barista': 'Barista',
  'role.shiftlead': 'Shift lead',

  // ---- demo dock ----
  'dock.title': 'Demo controls',
  'dock.screen.login': 'Login',
  'dock.screen.register': 'Register',
  'dock.screen.floor': 'Floor',
  'dock.screen.payment': 'Payment',
  'dock.screen.complete': 'Receipt',
  'dock.screen.kitchen': 'Kitchen',
  'dock.emptyTicket': 'Empty ticket',
  'dock.resetTicket': 'Reset ticket',
  'dock.cardWillDecline': 'Card: will decline',
  'dock.cardWillApprove': 'Card: will approve',
  'dock.newOrder': 'New order',
  'dock.autofillPin': 'Autofill PIN',
  'dock.goOffline': 'Go offline',
  'dock.goOnline': 'Go online',
  'dock.restaurant': 'Restaurant',
  'dock.retail': 'Retail',
  'dock.toggleConnectivity': 'Toggle connectivity',
  'dock.toggleTheme': 'Toggle theme',
  'dock.language': 'Language',

  // ---- top bar ----
  'topbar.subRetail': 'Ticket #{n} · started {d} ago',
  'topbar.subSeated': 'Ticket #{n} · {seats} · open {d}',
  'topbar.subUnassigned': 'Ticket #{n} · open {d}',
  'topbar.viewFloor': 'View the floor',
  'topbar.searchPlaceholder': 'Search menu or scan barcode',
  'topbar.workingOffline': 'Working offline',
  'topbar.held': 'Held',
  'topbar.shiftOpen': 'Open {d}',

  // ---- login / open shift ----
  'login.goodMorning': 'Good morning',
  'login.goodAfternoon': 'Good afternoon',
  'login.goodEvening': 'Good evening',
  'login.tapIn': '{greet} — tap in to start your shift',
  'login.pinError': 'Incorrect PIN — try again',
  'login.pinPrompt': 'Enter {name}’s 4-digit PIN',
  'login.backspace': 'Backspace',
  'login.countDrawer': 'Open shift · count drawer',
  'login.countDrawerHint':
    'Count the cash in the drawer to start the shift. This becomes the opening float.',
  'login.startingCash': 'Starting cash',
  'login.drawerMinus': '−{amount}',
  'login.drawerPlus': '+{amount}',
  'login.openShift': 'Open shift',

  // ---- register ----
  'register.quickAdd': 'Quick add',
  'register.soldOut': 'Sold out',
  'register.hasOptions': 'Has options',
  'register.densityComfortable': 'Comfortable',
  'register.densityDense': 'Dense',

  // ---- floor ----
  'floor.title': 'Floor',
  'floor.legendOpen': 'Open',
  'floor.legendOccupied': 'Occupied',
  'floor.legendAttention': 'Needs attention',
  'floor.seated': '{seated}/{total} seated',
  'floor.statusCurrent': 'Current',
  'floor.statusOpen': 'Open',
  'floor.statusOccupied': 'Occupied',
  'floor.statusAttention': 'Attention',
  'floor.openTicket': 'Open ticket',
  'floor.tapToSeat': 'Tap to seat',
  'floor.noteBillRequested': 'Bill requested',
  'floor.noteSentAgo': 'Sent {m}m ago',
  'floor.retailTitle': 'Retail mode — no floor',
  'floor.retailBody':
    'In retail mode there are no tables or tickets. Every sale is a straight walk-in: items go on the register and you tender immediately.',
  'floor.goToRegister': 'Go to register',

  // ---- ticket pane ----
  'ticket.subRetail': 'Ticket #{n}',
  'ticket.subSeated': 'Ticket #{n} · {seats}',
  'ticket.subUnassigned': 'Ticket #{n} · unassigned',
  'ticket.shared': 'Shared',
  'ticket.seatN': 'Seat {n}',
  'ticket.noItems': 'No items yet',
  'ticket.emptyHintRetail': 'Scan or tap items to build the sale.',
  'ticket.emptyHintTable': 'Tap the menu to start {table}’s ticket.',
  'ticket.seats': 'Seats',
  'ticket.moveMerge': 'Move / merge',
  'ticket.discountComp': 'Discount / comp',
  'ticket.sent': 'Sent',
  'ticket.increase': 'Add one',
  'ticket.decrease': 'Remove one',
  'ticket.removeLine': 'Remove item',
  'ticket.removeDiscount': 'Remove discount',
  'ticket.hold': 'Hold',
  'ticket.send': 'Send',
  'ticket.pay': 'Pay',

  // ---- modifier sheet ----
  'sheet.base': 'Base {amount}',
  'sheet.quantity': 'Quantity',
  'sheet.size': 'Size',
  'sheet.milk': 'Milk',
  'sheet.extras': 'Extras',
  'sheet.seat': 'Seat',
  'sheet.itemNote': 'Item note',
  'sheet.notePlaceholder': 'e.g. extra hot, oat foam, to stay',
  'sheet.noCustomizations': 'No customizations',
  'sheet.addToTicket': 'Add {qty} to ticket',
  'sheet.close': 'Close options',

  // ---- held tray ----
  'held.title': 'Held tickets',
  'held.empty': 'No held tickets',
  'held.emptyHint': 'Hold a ticket to park it here.',
  'held.for': 'held {d}',
  'held.resume': 'Resume',

  // ---- void modal ----
  'void.title': 'Void this item?',
  'void.confirmOne': 'Void {name}?',
  'void.confirmQty': 'Void {qty}× {name}?',
  'void.body':
    'This item was already sent to the kitchen. Type {word} to confirm and record it on the shift.',
  'void.confirmButton': 'Void item',

  // ---- move / merge modal ----
  'move.title': 'Move or merge',
  'move.at': 'This ticket is at {table}.',
  'move.moveToOpen': 'Move to an open table',
  'move.mergeHeld': 'Merge a held ticket into this one',

  // ---- discount modal ----
  'discount.title': 'Discount & comps',
  'discount.pctOff': '{pct}% off',
  'discount.amountOff': '{amount} off',
  'discount.comp': 'Comp · 100%',
  'discount.fullComp': 'Full comp',
  'discount.percentageOff': 'Percentage off',
  'discount.fixedAmount': 'Fixed amount',
  'discount.reason': 'Reason (logged on the shift)',
  'discount.reasonManager': 'Manager comp',
  'discount.reasonLoyalty': 'Loyalty member',
  'discount.reasonRecovery': 'Service recovery',
  'discount.reasonStaffMeal': 'Staff meal',
  'discount.reasonDamaged': 'Damaged item',
  'discount.removeCurrent': 'Remove current · {label}',

  // ---- payment ----
  'payment.title': 'Payment',
  'payment.back': 'Ticket',
  'payment.subtitle': 'Ticket #{n} · {table}',
  'payment.declinedTitle': 'Card declined',
  'payment.declinedHint': 'Ask for another card or choose a different method.',
  'payment.remainingBalance': 'Remaining balance',
  'payment.balanceDue': 'Balance due',
  'payment.qr': 'QR',
  'payment.qrPay': 'QR pay',
  'payment.noTip': 'No tip',
  'payment.tipPct': '{pct}%',
  'payment.splitBill': 'Split bill',
  'payment.splitEvenly': 'Split evenly',
  'payment.splitBadgeEven': 'Even · {n}-way',
  'payment.splitBadgeAmount': 'By amount · {amount}',
  'payment.ledger': 'Payer {i} of {n} · {amount} each',
  'payment.thisCharge': 'This charge · {amount}',
  'payment.nWays': '{n} ways',
  'payment.guestsN': 'Guests {n}',
  'payment.each': '{amount} ea',
  'payment.chargePart': 'Or charge part of the balance',
  'payment.tendered': 'Tendered',
  'payment.changeDue': 'Change due',
  'payment.exact': 'Exact',
  'payment.cardWaiting': 'Insert, tap, or swipe',
  'payment.cardWaitingSub': 'Present the card to charge {amount}',
  'payment.cardReading': 'Reading card…',
  'payment.cardReadingSub': 'Keep the card in place',
  'payment.cardApproved': 'Approved',
  'payment.cardApprovedSub': 'Completing sale…',
  'payment.cardDeclinedSub': 'Try another card or a different method',
  'payment.encrypted': 'Encrypted terminal · chip & contactless',
  'payment.scanToPay': 'Scan to pay {amount}',
  'payment.qrHint': 'Point the camera at the code — Apple Pay, Google Pay, or any wallet.',
  'payment.chargeReading': 'Reading…',
  'payment.retryCard': 'Retry card',
  'payment.charge': 'Charge {amount}',
  'payment.enterCash': 'Enter cash tendered',
  'payment.addPartial': 'Add {amount} · partial',
  'payment.markPaid': 'Mark paid {amount}',

  // ---- receipt / complete ----
  'complete.title': 'Payment complete',
  'complete.subtitle': 'Order #{n} · {table} · {time}',
  'complete.orderNo': 'Order #{n}',
  'complete.paidWith': 'Paid · {methods}',
  'complete.servedBy': 'Served by {staff} · Thank you!',
  'complete.printReceipt': 'Print receipt',
  'complete.email': 'Email',
  'complete.text': 'Text',
  'complete.contactPlaceholder': 'guest@email.com or phone number',
  'complete.newOrder': 'New order',
  'complete.backToFloor': 'Back to floor',

  // ---- kitchen display ----
  'kitchen.title': 'Kitchen display',
  'kitchen.subtitle': '{brand} · live order tickets',
  'kitchen.register': 'Register',
  'kitchen.allDay': 'All day',
  'kitchen.colNew': 'New',
  'kitchen.colCooking': 'In progress',
  'kitchen.colReady': 'Ready',
  'kitchen.bump': 'Bump',
  'kitchen.clearTicket': 'Clear ticket',

  // ---- toasts ----
  'toast.cardWillApprove': 'Card will approve',
  'toast.cardWillDecline': 'Card will decline',
  'toast.retailNoTables': 'Retail mode — no tables',
  'toast.shiftOpened': 'Shift opened · Drawer {amount}',
  'toast.nothingToSend': 'Nothing new to send',
  'toast.orderSent': 'Order sent to kitchen',
  'toast.ticketEmpty': 'Ticket is empty',
  'toast.ticketHeld': 'Ticket held',
  'toast.resumed': 'Resumed {table}',
  'toast.added': 'Added {name}',
  'toast.itemVoided': 'Item voided',
  'toast.movedTo': 'Moved to {table}',
  'toast.merged': 'Merged {table} in',
  'toast.comped': 'Comped · {label}',
  'toast.discounted': 'Discount · {label}',
  'toast.discountRemoved': 'Discount removed',
  'toast.addItemsFirst': 'Add items first',
  'toast.seated': 'Seated {table}',
  'toast.opened': 'Opened {table}',
  'toast.enterCash': 'Enter cash tendered',
  'toast.underShare': 'Under the {amount} share',
  'toast.paidPartial': 'Paid {amount} · {rem} left',
  'toast.paymentComplete': 'Payment complete · {amount}',
  'toast.cardDeclined': 'Card declined — try another card',
  'toast.cardSharePaid': 'Card share paid · {rem} left',
  'toast.walletSharePaid': 'Wallet share paid · {rem} left',
  'toast.printSent': 'Sent to receipt printer',
  'toast.receiptSentEmail': 'Email receipt sent',
  'toast.receiptSentText': 'Text receipt sent',
} as const;

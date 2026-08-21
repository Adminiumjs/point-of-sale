/**
 * Arabic (العربية) — RTL — ar-EG.
 *
 * Typed as `Record<MessageKey, string>` so the key set cannot drift from en.ts —
 * adding a key to en.ts breaks this file until it carries it too. Translate the
 * values in place; do not rename or reorder the keys.
 *
 * The cafe's own content — menu item names, modifier names, table labels, staff
 * names, order numbers — stays English, exactly as en.ts describes. So do the
 * payment-network and wallet brand names.
 *
 * Plural messages use `|`-separated variants in this locale's CLDR category
 * order — zero, one, two, few, many, other. See PLURAL_ORDER in ../index.tsx.
 */
import type { MessageKey } from './index';

export const ar: Record<MessageKey, string> = {
  // ---- shared chrome ----
  'common.cancel': 'إلغاء',
  'common.clear': 'مسح',
  'common.close': 'إغلاق',
  'common.subtotal': 'المجموع الفرعي',
  'common.total': 'الإجمالي',
  'common.tip': 'الإكرامية',
  'common.tax': 'الضريبة',
  'common.taxRate': 'الضريبة · {pct}%',
  'common.discount': 'الخصم',
  'common.cash': 'نقدًا',
  'common.card': 'بطاقة',
  'common.seatsCount':
    '{count} مقعد|{count} مقعد|{count} مقعد|{count} مقاعد|{count} مقعدًا|{count} مقعد',
  'common.itemsCount':
    '{count} صنف|{count} صنف|{count} صنف|{count} أصناف|{count} صنفًا|{count} صنف',
  'common.minutesShort': '{m} د',
  'common.durationHm': '{h} س {m} د',
  'common.justNow': 'الآن',
  'common.minutesAgo': 'منذ {m} د',

  // ---- item options (the option *names* stay English; these are the labels) ----
  'size.small': 'صغير',
  'size.medium': 'وسط',
  'size.large': 'كبير',
  'mod.milkSuffix': 'حليب {milk}',

  // ---- table naming (the number is the cafe's; the noun is ours) ----
  'table.table': 'طاولة {n}',
  'table.window': 'نافذة {n}',
  'table.patio': 'فناء {n}',
  'table.bar': 'بار {n}',
  'table.newTicket': 'فاتورة جديدة',
  'table.walkIn': 'بيع مباشر',

  // ---- floor zones ----
  'zone.window': 'نافذة',
  'zone.patio': 'فناء',
  'zone.bar': 'بار',
  'zone.main': 'رئيسي',

  // ---- menu categories ----
  'category.all': 'الكل',
  'category.coffee': 'قهوة',
  'category.tea': 'شاي',
  'category.food': 'طعام',
  'category.bakery': 'مخبوزات',
  'category.cold': 'مشروبات باردة',

  // ---- staff roles ----
  'role.barista': 'باريستا',
  'role.shiftlead': 'مسؤول الوردية',

  // ---- demo dock ----
  'dock.title': 'أدوات العرض',
  'dock.screen.login': 'تسجيل الدخول',
  'dock.screen.register': 'الكاشير',
  'dock.screen.floor': 'الصالة',
  'dock.screen.payment': 'الدفع',
  'dock.screen.complete': 'الإيصال',
  'dock.screen.kitchen': 'المطبخ',
  'dock.emptyTicket': 'فاتورة فارغة',
  'dock.resetTicket': 'إعادة ضبط الفاتورة',
  'dock.cardWillDecline': 'البطاقة: سترفض',
  'dock.cardWillApprove': 'البطاقة: ستقبل',
  'dock.newOrder': 'طلب جديد',
  'dock.autofillPin': 'تعبئة الرمز',
  'dock.goOffline': 'قطع الاتصال',
  'dock.goOnline': 'استعادة الاتصال',
  'dock.restaurant': 'مطعم',
  'dock.retail': 'تجزئة',
  'dock.toggleConnectivity': 'تبديل الاتصال',
  'dock.toggleTheme': 'تبديل المظهر',
  'dock.language': 'اللغة',

  // ---- top bar ----
  'topbar.subRetail': 'فاتورة #{n} · بدأت منذ {d}',
  'topbar.subSeated': 'فاتورة #{n} · {seats} · مفتوحة {d}',
  'topbar.subUnassigned': 'فاتورة #{n} · مفتوحة {d}',
  'topbar.viewFloor': 'عرض الصالة',
  'topbar.searchPlaceholder': 'ابحث في القائمة أو امسح الباركود',
  'topbar.workingOffline': 'العمل دون اتصال',
  'topbar.held': 'معلّقة',
  'topbar.shiftOpen': 'مفتوحة {d}',

  // ---- login / open shift ----
  'login.goodMorning': 'صباح الخير',
  'login.goodAfternoon': 'نهارك سعيد',
  'login.goodEvening': 'مساء الخير',
  'login.tapIn': '{greet} — سجّل دخولك لبدء ورديتك',
  'login.pinError': 'رمز غير صحيح — حاول مجددًا',
  'login.pinPrompt': 'أدخل رمز {name} المكوّن من 4 أرقام',
  'login.backspace': 'حذف رقم',
  'login.countDrawer': 'فتح الوردية · جرد الدرج',
  'login.countDrawerHint':
    'احسب النقد الموجود في الدرج لبدء الوردية. سيصبح هذا هو الرصيد الافتتاحي.',
  'login.startingCash': 'النقد الافتتاحي',
  'login.drawerMinus': '−{amount}',
  'login.drawerPlus': '+{amount}',
  'login.openShift': 'فتح الوردية',

  // ---- register ----
  'register.quickAdd': 'إضافة سريعة',
  'register.soldOut': 'نفد',
  'register.hasOptions': 'به خيارات',
  'register.densityComfortable': 'مريح',
  'register.densityDense': 'مكثّف',

  // ---- floor ----
  'floor.title': 'الصالة',
  'floor.legendOpen': 'متاحة',
  'floor.legendOccupied': 'مشغولة',
  'floor.legendAttention': 'تحتاج انتباهًا',
  'floor.seated': '{seated}/{total} جالسين',
  'floor.statusCurrent': 'الحالية',
  'floor.statusOpen': 'متاحة',
  'floor.statusOccupied': 'مشغولة',
  'floor.statusAttention': 'انتباه',
  'floor.openTicket': 'فتح الفاتورة',
  'floor.tapToSeat': 'اضغط للإجلاس',
  'floor.noteBillRequested': 'طلب الحساب',
  'floor.noteSentAgo': 'أُرسل منذ {m} د',
  'floor.retailTitle': 'وضع التجزئة — لا توجد صالة',
  'floor.retailBody':
    'في وضع التجزئة لا توجد طاولات ولا فواتير مفتوحة. كل عملية بيع مباشرة: تُضاف الأصناف إلى الكاشير ثم تُحصّل الدفعة فورًا.',
  'floor.goToRegister': 'الذهاب إلى الكاشير',

  // ---- ticket pane ----
  'ticket.subRetail': 'فاتورة #{n}',
  'ticket.subSeated': 'فاتورة #{n} · {seats}',
  'ticket.subUnassigned': 'فاتورة #{n} · غير مخصصة',
  'ticket.shared': 'مشترك',
  'ticket.seatN': 'مقعد {n}',
  'ticket.noItems': 'لا توجد أصناف بعد',
  'ticket.emptyHintRetail': 'امسح الأصناف أو اضغط عليها لبناء عملية البيع.',
  'ticket.emptyHintTable': 'اضغط على القائمة لبدء فاتورة {table}.',
  'ticket.seats': 'المقاعد',
  'ticket.moveMerge': 'نقل / دمج',
  'ticket.discountComp': 'خصم / مجاني',
  'ticket.sent': 'أُرسل',
  'ticket.increase': 'إضافة واحد',
  'ticket.decrease': 'إزالة واحد',
  'ticket.removeLine': 'إزالة الصنف',
  'ticket.removeDiscount': 'إزالة الخصم',
  'ticket.hold': 'تعليق',
  'ticket.send': 'إرسال',
  'ticket.pay': 'دفع',

  // ---- modifier sheet ----
  'sheet.base': 'الأساس {amount}',
  'sheet.quantity': 'الكمية',
  'sheet.size': 'الحجم',
  'sheet.milk': 'الحليب',
  'sheet.extras': 'إضافات',
  'sheet.seat': 'المقعد',
  'sheet.itemNote': 'ملاحظة على الصنف',
  'sheet.notePlaceholder': 'مثال: ساخن جدًا، رغوة شوفان، للتناول هنا',
  'sheet.noCustomizations': 'بدون تخصيص',
  'sheet.addToTicket': 'إضافة {qty} إلى الفاتورة',
  'sheet.close': 'إغلاق الخيارات',

  // ---- held tray ----
  'held.title': 'الفواتير المعلّقة',
  'held.empty': 'لا توجد فواتير معلّقة',
  'held.emptyHint': 'علّق فاتورة لحفظها هنا.',
  'held.for': 'معلّقة منذ {d}',
  'held.resume': 'استئناف',

  // ---- void modal ----
  'void.title': 'إبطال هذا الصنف؟',
  'void.confirmOne': 'إبطال {name}؟',
  'void.confirmQty': 'إبطال {qty}× {name}؟',
  'void.body':
    'أُرسل هذا الصنف إلى المطبخ بالفعل. اكتب {word} للتأكيد وتسجيله على الوردية.',
  'void.confirmButton': 'إبطال الصنف',

  // ---- move / merge modal ----
  'move.title': 'نقل أو دمج',
  'move.at': 'هذه الفاتورة على {table}.',
  'move.moveToOpen': 'النقل إلى طاولة متاحة',
  'move.mergeHeld': 'دمج فاتورة معلّقة في هذه',

  // ---- discount modal ----
  'discount.title': 'الخصومات والمجانيات',
  'discount.pctOff': 'خصم {pct}%',
  'discount.amountOff': 'خصم {amount}',
  'discount.comp': 'مجاني · 100%',
  'discount.fullComp': 'مجاني بالكامل',
  'discount.percentageOff': 'خصم بنسبة',
  'discount.fixedAmount': 'مبلغ ثابت',
  'discount.reason': 'السبب (يُسجَّل على الوردية)',
  'discount.reasonManager': 'مجاملة المدير',
  'discount.reasonLoyalty': 'عضو ولاء',
  'discount.reasonRecovery': 'تعويض عن الخدمة',
  'discount.reasonStaffMeal': 'وجبة موظفين',
  'discount.reasonDamaged': 'صنف تالف',
  'discount.removeCurrent': 'إزالة الحالي · {label}',

  // ---- payment ----
  'payment.title': 'الدفع',
  'payment.back': 'الفاتورة',
  'payment.subtitle': 'فاتورة #{n} · {table}',
  'payment.declinedTitle': 'رُفضت البطاقة',
  'payment.declinedHint': 'اطلب بطاقة أخرى أو اختر طريقة مختلفة.',
  'payment.remainingBalance': 'الرصيد المتبقي',
  'payment.balanceDue': 'المبلغ المستحق',
  'payment.qr': 'QR',
  'payment.qrPay': 'الدفع بـ QR',
  'payment.noTip': 'بدون إكرامية',
  'payment.tipPct': '{pct}%',
  'payment.splitBill': 'تقسيم الحساب',
  'payment.splitEvenly': 'تقسيم بالتساوي',
  'payment.splitBadgeEven': 'بالتساوي · {n} أجزاء',
  'payment.splitBadgeAmount': 'حسب المبلغ · {amount}',
  'payment.ledger': 'الدافع {i} من {n} · {amount} لكل واحد',
  'payment.thisCharge': 'هذه الدفعة · {amount}',
  'payment.nWays': '{n} أجزاء',
  'payment.guestsN': 'الضيوف {n}',
  'payment.each': '{amount} للفرد',
  'payment.chargePart': 'أو حصّل جزءًا من الرصيد',
  'payment.tendered': 'المدفوع',
  'payment.changeDue': 'الباقي',
  'payment.exact': 'مضبوط',
  'payment.cardWaiting': 'أدخل البطاقة أو قرّبها',
  'payment.cardWaitingSub': 'قدّم البطاقة لتحصيل {amount}',
  'payment.cardReading': 'جارٍ قراءة البطاقة…',
  'payment.cardReadingSub': 'أبقِ البطاقة في مكانها',
  'payment.cardApproved': 'مقبولة',
  'payment.cardApprovedSub': 'جارٍ إتمام البيع…',
  'payment.cardDeclinedSub': 'جرّب بطاقة أخرى أو طريقة مختلفة',
  'payment.encrypted': 'طرفية مشفّرة · شريحة ودفع تقريبي',
  'payment.scanToPay': 'امسح الرمز لدفع {amount}',
  'payment.qrHint': 'وجّه الكاميرا نحو الرمز — Apple Pay أو Google Pay أو أي محفظة.',
  'payment.chargeReading': 'جارٍ القراءة…',
  'payment.retryCard': 'إعادة المحاولة',
  'payment.charge': 'تحصيل {amount}',
  'payment.enterCash': 'أدخل المبلغ النقدي',
  'payment.addPartial': 'إضافة {amount} · جزئي',
  'payment.markPaid': 'تسجيل دفع {amount}',

  // ---- receipt / complete ----
  'complete.title': 'اكتمل الدفع',
  'complete.subtitle': 'طلب #{n} · {table} · {time}',
  'complete.orderNo': 'طلب #{n}',
  'complete.paidWith': 'مدفوع · {methods}',
  'complete.servedBy': 'خدمك {staff} · شكرًا لك!',
  'complete.printReceipt': 'طباعة الإيصال',
  'complete.email': 'بريد',
  'complete.text': 'رسالة',
  'complete.contactPlaceholder': 'guest@email.com أو رقم الهاتف',
  'complete.newOrder': 'طلب جديد',
  'complete.backToFloor': 'العودة إلى الصالة',

  // ---- kitchen display ----
  'kitchen.title': 'شاشة المطبخ',
  'kitchen.subtitle': '{brand} · طلبات مباشرة',
  'kitchen.register': 'الكاشير',
  'kitchen.allDay': 'إجمالي اليوم',
  'kitchen.colNew': 'جديد',
  'kitchen.colCooking': 'قيد التحضير',
  'kitchen.colReady': 'جاهز',
  'kitchen.bump': 'إنهاء',
  'kitchen.clearTicket': 'مسح الطلب',

  // ---- toasts ----
  'toast.cardWillApprove': 'ستُقبل البطاقة',
  'toast.cardWillDecline': 'ستُرفض البطاقة',
  'toast.retailNoTables': 'وضع التجزئة — لا توجد طاولات',
  'toast.shiftOpened': 'فُتحت الوردية · الدرج {amount}',
  'toast.nothingToSend': 'لا يوجد جديد للإرسال',
  'toast.orderSent': 'أُرسل الطلب إلى المطبخ',
  'toast.ticketEmpty': 'الفاتورة فارغة',
  'toast.ticketHeld': 'عُلّقت الفاتورة',
  'toast.resumed': 'استُؤنفت {table}',
  'toast.added': 'أُضيف {name}',
  'toast.itemVoided': 'أُبطل الصنف',
  'toast.movedTo': 'نُقلت إلى {table}',
  'toast.merged': 'دُمجت {table}',
  'toast.comped': 'مجاني · {label}',
  'toast.discounted': 'خصم · {label}',
  'toast.discountRemoved': 'أُزيل الخصم',
  'toast.addItemsFirst': 'أضف أصنافًا أولًا',
  'toast.seated': 'تم إجلاس {table}',
  'toast.opened': 'فُتحت {table}',
  'toast.enterCash': 'أدخل المبلغ النقدي',
  'toast.underShare': 'أقل من حصة {amount}',
  'toast.paidPartial': 'دُفع {amount} · تبقّى {rem}',
  'toast.paymentComplete': 'اكتمل الدفع · {amount}',
  'toast.cardDeclined': 'رُفضت البطاقة — جرّب بطاقة أخرى',
  'toast.cardSharePaid': 'دُفعت حصة البطاقة · تبقّى {rem}',
  'toast.walletSharePaid': 'دُفعت حصة المحفظة · تبقّى {rem}',
  'toast.printSent': 'أُرسل إلى طابعة الإيصالات',
  'toast.receiptSentEmail': 'أُرسل الإيصال بالبريد',
  'toast.receiptSentText': 'أُرسل الإيصال برسالة نصية',
};

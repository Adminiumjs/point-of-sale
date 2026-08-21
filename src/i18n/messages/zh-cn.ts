/**
 * Simplified Chinese (简体中文) — zh-CN.
 *
 * Typed as `Record<MessageKey, string>` so the key set cannot drift from en.ts —
 * adding a key to en.ts breaks this file until it carries it too. Do not rename
 * or reorder the keys.
 *
 * The cafe's own content — menu item names, modifier names, table labels, staff
 * names, order numbers, the receipt address — stays English by design, so
 * strings like `mod.milkSuffix` compose a Chinese noun onto an English name.
 *
 * Plural messages use `|`-separated variants in this locale's CLDR category
 * order — see PLURAL_ORDER in ../index.tsx. Chinese has a single category
 * (`other`), so plural strings carry exactly one variant and no `|`.
 */
import type { MessageKey } from './index';

export const zhCn: Record<MessageKey, string> = {
  // ---- shared chrome ----
  'common.cancel': '取消',
  'common.clear': '清空',
  'common.close': '关闭',
  'common.subtotal': '小计',
  'common.total': '合计',
  'common.tip': '小费',
  'common.tax': '税费',
  'common.taxRate': '税费 · {pct}%',
  'common.discount': '折扣',
  'common.cash': '现金',
  'common.card': '刷卡',
  'common.seatsCount': '{count} 个座位',
  'common.itemsCount': '{count} 件商品',
  'common.minutesShort': '{m}分钟',
  'common.durationHm': '{h}小时{m}分',
  'common.justNow': '刚刚',
  'common.minutesAgo': '{m}分钟前',

  // ---- item options (the option *names* stay English; these are the labels) ----
  'size.small': '小',
  'size.medium': '中',
  'size.large': '大',
  'mod.milkSuffix': '{milk}奶',

  // ---- table naming (the number is the cafe's; the noun is ours) ----
  'table.table': '{n}号桌',
  'table.window': '窗边{n}号',
  'table.patio': '露台{n}号',
  'table.bar': '吧台{n}号',
  'table.newTicket': '新建账单',
  'table.walkIn': '散客销售',

  // ---- floor zones ----
  'zone.window': '窗边',
  'zone.patio': '露台',
  'zone.bar': '吧台',
  'zone.main': '主区',

  // ---- menu categories ----
  'category.all': '全部',
  'category.coffee': '咖啡',
  'category.tea': '茶饮',
  'category.food': '餐食',
  'category.bakery': '烘焙',
  'category.cold': '冷饮',

  // ---- staff roles ----
  'role.barista': '咖啡师',
  'role.shiftlead': '值班主管',

  // ---- demo dock ----
  'dock.title': '演示控制',
  'dock.screen.login': '登录',
  'dock.screen.register': '收银',
  'dock.screen.floor': '桌位',
  'dock.screen.payment': '支付',
  'dock.screen.complete': '小票',
  'dock.screen.kitchen': '后厨',
  'dock.emptyTicket': '清空账单',
  'dock.resetTicket': '重置账单',
  'dock.cardWillDecline': '刷卡：将被拒',
  'dock.cardWillApprove': '刷卡：将通过',
  'dock.newOrder': '新订单',
  'dock.autofillPin': '自动填入 PIN',
  'dock.goOffline': '切换离线',
  'dock.goOnline': '切换在线',
  'dock.restaurant': '餐厅',
  'dock.retail': '零售',
  'dock.toggleConnectivity': '切换网络',
  'dock.toggleTheme': '切换主题',
  'dock.language': '语言',

  // ---- top bar ----
  'topbar.subRetail': '账单 #{n} · {d}前开始',
  'topbar.subSeated': '账单 #{n} · {seats} · 已开{d}',
  'topbar.subUnassigned': '账单 #{n} · 已开{d}',
  'topbar.viewFloor': '查看桌位',
  'topbar.searchPlaceholder': '搜索菜单或扫描条码',
  'topbar.workingOffline': '离线工作中',
  'topbar.held': '已挂起',
  'topbar.shiftOpen': '已开{d}',

  // ---- login / open shift ----
  'login.goodMorning': '早上好',
  'login.goodAfternoon': '下午好',
  'login.goodEvening': '晚上好',
  'login.tapIn': '{greet}——打卡开始本班次',
  'login.pinError': 'PIN 码错误——请重试',
  'login.pinPrompt': '请输入 {name} 的 4 位 PIN 码',
  'login.backspace': '退格',
  'login.countDrawer': '开班 · 清点钱箱',
  'login.countDrawerHint': '清点钱箱内的现金以开始本班次，该金额将作为开班备用金。',
  'login.startingCash': '开班现金',
  'login.drawerMinus': '−{amount}',
  'login.drawerPlus': '+{amount}',
  'login.openShift': '开班',

  // ---- register ----
  'register.quickAdd': '快速添加',
  'register.soldOut': '售罄',
  'register.hasOptions': '有选项',
  'register.densityComfortable': '宽松',
  'register.densityDense': '紧凑',

  // ---- floor ----
  'floor.title': '桌位',
  'floor.legendOpen': '空闲',
  'floor.legendOccupied': '使用中',
  'floor.legendAttention': '需要关注',
  'floor.seated': '已就座 {seated}/{total}',
  'floor.statusCurrent': '当前',
  'floor.statusOpen': '空闲',
  'floor.statusOccupied': '使用中',
  'floor.statusAttention': '关注',
  'floor.openTicket': '打开账单',
  'floor.tapToSeat': '点击安排就座',
  'floor.noteBillRequested': '已要求结账',
  'floor.noteSentAgo': '{m}分钟前已下单',
  'floor.retailTitle': '零售模式——无桌位',
  'floor.retailBody':
    '零售模式下没有桌位和账单。每笔交易都是散客直销：商品加入收银台后立即收款。',
  'floor.goToRegister': '前往收银',

  // ---- ticket pane ----
  'ticket.subRetail': '账单 #{n}',
  'ticket.subSeated': '账单 #{n} · {seats}',
  'ticket.subUnassigned': '账单 #{n} · 未分配',
  'ticket.shared': '共享',
  'ticket.seatN': '{n}号座',
  'ticket.noItems': '暂无商品',
  'ticket.emptyHintRetail': '扫码或点选商品以开始本次销售。',
  'ticket.emptyHintTable': '点击菜单开始 {table} 的账单。',
  'ticket.seats': '座位',
  'ticket.moveMerge': '转台 / 合并',
  'ticket.discountComp': '折扣 / 赠单',
  'ticket.sent': '已下单',
  'ticket.increase': '增加一件',
  'ticket.decrease': '减少一件',
  'ticket.removeLine': '删除商品',
  'ticket.removeDiscount': '取消折扣',
  'ticket.hold': '挂单',
  'ticket.send': '下单',
  'ticket.pay': '结账',

  // ---- modifier sheet ----
  'sheet.base': '基础价 {amount}',
  'sheet.quantity': '数量',
  'sheet.size': '规格',
  'sheet.milk': '奶品',
  'sheet.extras': '加料',
  'sheet.seat': '座位',
  'sheet.itemNote': '商品备注',
  'sheet.notePlaceholder': '例如：多加热、燕麦奶泡、堂食',
  'sheet.noCustomizations': '无可选项',
  'sheet.addToTicket': '加入账单 {qty} 件',
  'sheet.close': '关闭选项',

  // ---- held tray ----
  'held.title': '挂起的账单',
  'held.empty': '没有挂起的账单',
  'held.emptyHint': '挂起账单后会暂存在这里。',
  'held.for': '已挂{d}',
  'held.resume': '恢复',

  // ---- void modal ----
  'void.title': '作废该商品？',
  'void.confirmOne': '作废 {name}？',
  'void.confirmQty': '作废 {qty}× {name}？',
  'void.body': '该商品已发送至后厨。输入 {word} 确认作废，并记入本班次。',
  'void.confirmButton': '作废商品',

  // ---- move / merge modal ----
  'move.title': '转台或合并',
  'move.at': '该账单位于 {table}。',
  'move.moveToOpen': '转到空闲桌位',
  'move.mergeHeld': '将挂起的账单合并到此单',

  // ---- discount modal ----
  'discount.title': '折扣与赠单',
  'discount.pctOff': '减 {pct}%',
  'discount.amountOff': '减 {amount}',
  'discount.comp': '赠单 · 100%',
  'discount.fullComp': '全单赠送',
  'discount.percentageOff': '按百分比',
  'discount.fixedAmount': '按固定金额',
  'discount.reason': '原因（记入本班次）',
  'discount.reasonManager': '经理赠送',
  'discount.reasonLoyalty': '会员优惠',
  'discount.reasonRecovery': '服务补偿',
  'discount.reasonStaffMeal': '员工餐',
  'discount.reasonDamaged': '商品损坏',
  'discount.removeCurrent': '移除当前 · {label}',

  // ---- payment ----
  'payment.title': '支付',
  'payment.back': '账单',
  'payment.subtitle': '账单 #{n} · {table}',
  'payment.declinedTitle': '刷卡被拒',
  'payment.declinedHint': '请更换一张卡或选择其他支付方式。',
  'payment.remainingBalance': '剩余金额',
  'payment.balanceDue': '应付金额',
  'payment.qr': '二维码',
  'payment.qrPay': '扫码支付',
  'payment.noTip': '不给小费',
  'payment.tipPct': '{pct}%',
  'payment.splitBill': '拆分账单',
  'payment.splitEvenly': '平均拆分',
  'payment.splitBadgeEven': '平均 · {n}份',
  'payment.splitBadgeAmount': '按金额 · {amount}',
  'payment.ledger': '第 {i}/{n} 位付款人 · 每人 {amount}',
  'payment.thisCharge': '本次收款 · {amount}',
  'payment.nWays': '{n} 份',
  'payment.guestsN': '{n} 位客人',
  'payment.each': '每份 {amount}',
  'payment.chargePart': '或收取部分金额',
  'payment.tendered': '实收',
  'payment.changeDue': '应找零',
  'payment.exact': '正好',
  'payment.cardWaiting': '插卡、感应或刷卡',
  'payment.cardWaitingSub': '出示卡片以支付 {amount}',
  'payment.cardReading': '正在读卡…',
  'payment.cardReadingSub': '请保持卡片不动',
  'payment.cardApproved': '已通过',
  'payment.cardApprovedSub': '正在完成交易…',
  'payment.cardDeclinedSub': '请更换卡片或改用其他方式',
  'payment.encrypted': '加密终端 · 支持芯片与感应',
  'payment.scanToPay': '扫码支付 {amount}',
  'payment.qrHint': '将摄像头对准二维码——支持 Apple Pay、Google Pay 或任意钱包。',
  'payment.chargeReading': '读取中…',
  'payment.retryCard': '重试刷卡',
  'payment.charge': '收款 {amount}',
  'payment.enterCash': '请输入实收现金',
  'payment.addPartial': '添加 {amount} · 部分',
  'payment.markPaid': '标记已付 {amount}',

  // ---- receipt / complete ----
  'complete.title': '支付完成',
  'complete.subtitle': '订单 #{n} · {table} · {time}',
  'complete.orderNo': '订单 #{n}',
  'complete.paidWith': '已支付 · {methods}',
  'complete.servedBy': '服务员 {staff} · 谢谢惠顾！',
  'complete.printReceipt': '打印小票',
  'complete.email': '邮件',
  'complete.text': '短信',
  'complete.contactPlaceholder': 'guest@email.com 或手机号',
  'complete.newOrder': '新订单',
  'complete.backToFloor': '返回桌位',

  // ---- kitchen display ----
  'kitchen.title': '后厨显示屏',
  'kitchen.subtitle': '{brand} · 实时订单',
  'kitchen.register': '收银',
  'kitchen.allDay': '全天汇总',
  'kitchen.colNew': '新单',
  'kitchen.colCooking': '制作中',
  'kitchen.colReady': '待取',
  'kitchen.bump': '完成',
  'kitchen.clearTicket': '清除订单',

  // ---- toasts ----
  'toast.cardWillApprove': '刷卡将通过',
  'toast.cardWillDecline': '刷卡将被拒',
  'toast.retailNoTables': '零售模式——无桌位',
  'toast.shiftOpened': '班次已开始 · 钱箱 {amount}',
  'toast.nothingToSend': '没有新内容可下单',
  'toast.orderSent': '订单已发送至后厨',
  'toast.ticketEmpty': '账单为空',
  'toast.ticketHeld': '账单已挂起',
  'toast.resumed': '已恢复 {table}',
  'toast.added': '已添加 {name}',
  'toast.itemVoided': '商品已作废',
  'toast.movedTo': '已转到 {table}',
  'toast.merged': '已合并 {table}',
  'toast.comped': '已赠单 · {label}',
  'toast.discounted': '折扣 · {label}',
  'toast.discountRemoved': '折扣已取消',
  'toast.addItemsFirst': '请先添加商品',
  'toast.seated': '{table} 已就座',
  'toast.opened': '已打开 {table}',
  'toast.enterCash': '请输入实收现金',
  'toast.underShare': '低于 {amount} 的应付份额',
  'toast.paidPartial': '已付 {amount} · 剩余 {rem}',
  'toast.paymentComplete': '支付完成 · {amount}',
  'toast.cardDeclined': '刷卡被拒——请更换卡片',
  'toast.cardSharePaid': '刷卡份额已付 · 剩余 {rem}',
  'toast.walletSharePaid': '钱包份额已付 · 剩余 {rem}',
  'toast.printSent': '已发送至小票打印机',
  'toast.receiptSentEmail': '邮件小票已发送',
  'toast.receiptSentText': '短信小票已发送',
};

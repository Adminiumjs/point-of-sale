/**
 * The sample menu's names in every language the app speaks.
 *
 * The till's message bundles stop at UI chrome on purpose: an operator's own
 * menu is whatever they typed, in whatever language they typed it. Sample data
 * is different — it is ours, and it is added by someone reading the dashboard
 * in their own language, so a German operator trying the app gets a
 * "Grüner Tee", not a "Green Tea" they then have to rename (D15). These are
 * those names: content, not chrome, so they live beside the demo data rather
 * than in the bundles.
 *
 * Category, zone and role names are chrome and come from the bundles.
 */
import type { LocaleTag } from '../i18n/locales';

export type Names = Record<LocaleTag, string>;

const n = (en: string, de: string, fr: string, da: string, cs: string, ar: string, zhCN: string, zhTW: string): Names => ({
  'en-US': en,
  'de-DE': de,
  'fr-FR': fr,
  'da-DK': da,
  'cs-CZ': cs,
  'ar-EG': ar,
  'zh-CN': zhCN,
  'zh-TW': zhTW,
});

/** By the menu item's id in demo.ts. */
export const ITEM_NAMES: Record<string, Names> = {
  espresso: n('Espresso', 'Espresso', 'Espresso', 'Espresso', 'Espresso', 'إسبريسو', '意式浓缩', '義式濃縮'),
  flatwhite: n('Flat White', 'Flat White', 'Flat white', 'Flat white', 'Flat white', 'فلات وايت', '馥芮白', '馥芮白'),
  cappuccino: n('Cappuccino', 'Cappuccino', 'Cappuccino', 'Cappuccino', 'Cappuccino', 'كابتشينو', '卡布奇诺', '卡布奇諾'),
  latte: n('Latte', 'Latte', 'Café latte', 'Caffe latte', 'Latte', 'لاتيه', '拿铁', '拿鐵'),
  americano: n('Americano', 'Americano', 'Americano', 'Americano', 'Americano', 'أمريكانو', '美式咖啡', '美式咖啡'),
  mocha: n('Mocha', 'Mokka', 'Moka', 'Mokka', 'Mocha', 'موكا', '摩卡', '摩卡'),
  chai: n('Chai Latte', 'Chai Latte', 'Chai latte', 'Chai latte', 'Chai latte', 'شاي لاتيه', '印度拉茶', '印度拉茶'),
  earlgrey: n('Earl Grey', 'Earl Grey', 'Earl Grey', 'Earl Grey', 'Earl Grey', 'إيرل غراي', '伯爵茶', '伯爵茶'),
  greentea: n('Green Tea', 'Grüner Tee', 'Thé vert', 'Grøn te', 'Zelený čaj', 'شاي أخضر', '绿茶', '綠茶'),
  matcha: n('Matcha Latte', 'Matcha Latte', 'Matcha latte', 'Matcha latte', 'Matcha latte', 'ماتشا لاتيه', '抹茶拿铁', '抹茶拿鐵'),
  avotoast: n('Avocado Toast', 'Avocado-Toast', 'Toast à l’avocat', 'Avocadotoast', 'Avokádový toast', 'توست الأفوكادو', '牛油果吐司', '酪梨吐司'),
  bowl: n('Breakfast Bowl', 'Frühstücks-Bowl', 'Bol du petit-déjeuner', 'Morgenmadsbowl', 'Snídaňová miska', 'وعاء الفطور', '早餐碗', '早餐碗'),
  wrap: n('Halloumi Wrap', 'Halloumi-Wrap', 'Wrap au halloumi', 'Halloumi-wrap', 'Wrap s halloumi', 'راب الحلوم', '哈罗米奶酪卷', '哈羅米起司捲'),
  soup: n('Soup of the Day', 'Tagessuppe', 'Soupe du jour', 'Dagens suppe', 'Polévka dne', 'حساء اليوم', '每日例汤', '每日例湯'),
  quiche: n('Quiche Lorraine', 'Quiche Lorraine', 'Quiche lorraine', 'Quiche Lorraine', 'Quiche Lorraine', 'كيش لورين', '洛林乳蛋饼', '洛林鹹派'),
  croissant: n('Croissant', 'Croissant', 'Croissant', 'Croissant', 'Croissant', 'كرواسون', '可颂', '可頌'),
  almond: n('Almond Croissant', 'Mandelcroissant', 'Croissant aux amandes', 'Mandelcroissant', 'Mandlový croissant', 'كرواسون باللوز', '杏仁可颂', '杏仁可頌'),
  banana: n('Banana Bread', 'Bananenbrot', 'Pain à la banane', 'Bananbrød', 'Banánový chlebíček', 'خبز الموز', '香蕉面包', '香蕉麵包'),
  muffin: n('Blueberry Muffin', 'Blaubeermuffin', 'Muffin aux myrtilles', 'Blåbærmuffin', 'Borůvkový muffin', 'مافن التوت الأزرق', '蓝莓松饼', '藍莓馬芬'),
  cinnamon: n('Cinnamon Roll', 'Zimtschnecke', 'Roulé à la cannelle', 'Kanelsnegl', 'Skořicový šnek', 'لفائف القرفة', '肉桂卷', '肉桂捲'),
  coldbrew: n('Cold Brew', 'Cold Brew', 'Cold brew', 'Cold brew', 'Cold brew', 'كولد برو', '冷萃咖啡', '冷萃咖啡'),
  icedlatte: n('Iced Latte', 'Eis-Latte', 'Latte glacé', 'Iskaffe latte', 'Ledové latte', 'لاتيه مثلج', '冰拿铁', '冰拿鐵'),
  oj: n('Fresh OJ', 'Frischer O-Saft', 'Jus d’orange frais', 'Friskpresset appelsinjuice', 'Čerstvý pomerančový džus', 'عصير برتقال طازج', '鲜榨橙汁', '鮮榨柳橙汁'),
  sparkling: n('Sparkling Water', 'Sprudelwasser', 'Eau pétillante', 'Danskvand', 'Perlivá voda', 'مياه فوارة', '气泡水', '氣泡水'),
  lemonade: n('Lemonade', 'Limonade', 'Limonade', 'Lemonade', 'Limonáda', 'ليموناضة', '柠檬水', '檸檬水'),
};

/** A group of options, by its slug. */
export const GROUP_NAMES: Record<'size' | 'milk' | 'extras', Names> = {
  size: n('Size', 'Größe', 'Taille', 'Størrelse', 'Velikost', 'الحجم', '杯型', '杯型'),
  milk: n('Milk', 'Milch', 'Lait', 'Mælk', 'Mléko', 'الحليب', '奶类', '奶類'),
  extras: n('Extras', 'Extras', 'Suppléments', 'Tilvalg', 'Doplňky', 'إضافات', '加料', '加料'),
};

/** An option, by the name the till prices it under (demo.ts `MILKS` / `EXTRAS`). */
export const OPTION_NAMES: Record<string, Names> = {
  Whole: n('Whole milk', 'Vollmilch', 'Lait entier', 'Sødmælk', 'Plnotučné mléko', 'حليب كامل الدسم', '全脂奶', '全脂奶'),
  Oat: n('Oat milk', 'Hafermilch', 'Lait d’avoine', 'Havredrik', 'Ovesné mléko', 'حليب الشوفان', '燕麦奶', '燕麥奶'),
  Almond: n('Almond milk', 'Mandelmilch', 'Lait d’amande', 'Mandeldrik', 'Mandlové mléko', 'حليب اللوز', '杏仁奶', '杏仁奶'),
  Skim: n('Skim milk', 'Magermilch', 'Lait écrémé', 'Skummetmælk', 'Odtučněné mléko', 'حليب خالي الدسم', '脱脂奶', '脫脂奶'),
  'Extra shot': n('Extra shot', 'Extra Shot', 'Shot supplémentaire', 'Ekstra shot', 'Extra shot', 'جرعة إضافية', '加浓', '加濃'),
  Vanilla: n('Vanilla', 'Vanille', 'Vanille', 'Vanilje', 'Vanilka', 'فانيليا', '香草', '香草'),
  Caramel: n('Caramel', 'Karamell', 'Caramel', 'Karamel', 'Karamel', 'كراميل', '焦糖', '焦糖'),
  Hazelnut: n('Hazelnut', 'Haselnuss', 'Noisette', 'Hasselnød', 'Lískový oříšek', 'بندق', '榛果', '榛果'),
  Decaf: n('Decaf', 'Entkoffeiniert', 'Déca', 'Koffeinfri', 'Bez kofeinu', 'منزوع الكافيين', '低因', '低咖啡因'),
};

/**
 * The sample's other words a reader sees: the receipt's footer, the void and
 * refund reasons, the request on the booking "Manage my booking" finds.
 */
export const TEXT_NAMES = {
  receiptFooter: n('Thank you for stopping by.', 'Danke für Ihren Besuch.', 'Merci de votre visite.', 'Tak fordi du kiggede forbi.', 'Děkujeme za návštěvu.', 'شكرًا لزيارتكم.', '感谢您的光临。', '感謝您的光臨。'),
  voidReason: n('Rung up by mistake', 'Versehentlich boniert', 'Saisi par erreur', 'Slået forkert ind', 'Omylem namarkováno', 'أُدخل عن طريق الخطأ', '误录入', '誤輸入'),
  refundReason: n('Wrong item', 'Falscher Artikel', 'Mauvais article', 'Forkert vare', 'Nesprávná položka', 'صنف خاطئ', '商品有误', '品項有誤'),
  quietTable: n('A quiet table, if possible', 'Wenn möglich ein ruhiger Tisch', 'Une table au calme, si possible', 'Et roligt bord, hvis muligt', 'Pokud možno klidný stůl', 'طاولة هادئة إن أمكن', '如有可能，请安排安静的座位', '如有可能，請安排安靜的座位'),
} satisfies Record<string, Names>;

/** The loyalty rewards (wave 2): a name the guest reads, in every language. */
export const REWARD_NAMES = {
  latte: n('Free latte', 'Gratis Latte', 'Latte offert', 'Gratis latte', 'Latte zdarma', 'لاتيه مجاني', '免费拿铁', '免費拿鐵'),
  pastry: n('Free pastry', 'Gratis Gebäck', 'Viennoiserie offerte', 'Gratis bagværk', 'Pečivo zdarma', 'معجنات مجانية', '免费糕点', '免費糕點'),
  bowl: n('Free breakfast bowl', 'Gratis Frühstücksbowl', 'Bol petit-déjeuner offert', 'Gratis morgenmadsskål', 'Snídaňová miska zdarma', 'وعاء فطور مجاني', '免费早餐碗', '免費早餐碗'),
} satisfies Record<string, Names>;

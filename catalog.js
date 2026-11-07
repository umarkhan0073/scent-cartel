"use strict";
const { slugify } = require("./util");
const GK = { m: "men", w: "women", u: "unisex" };
// name | m=Men w=Women u=Unisex | 5ml price | 10ml price (PKR)
const RAW = ["Rasasi Hawas|m|700|1250","Rasasi Hawas Ice|m|800|1400","Rasasi Hawas Tropical|m|700|1250","French Tobacco|u|650|1200","Vintage Tobacco|u|850|1600","Rayhaan Pacific Aura|m|600|1200","Afnan Supremacy Collector’s Edition|m|1000|2000","Afnan 9PM Night Out|m|900|1800","Lattafa Khamrah Waha|u|900|1700","Lattafa Anham|u|700|1300","Club de Nuit Woman|w|700|1300","CDNIM Pure Parfum|m|800|1500","Bleu de Chanel Parfum|m|3200|5500","Dior Sauvage Parfum|m|1800|3400","YSL Y EDP|m|1900|3600","Office for Men|m|1600|3000","Chanel Allure Homme Sport Extreme|m|2700|5200","D&G Light Blue Intense|m|1500|2800","Acqua di Gio Profondo|m|1800|3400","Versace Eros EDP|m|1500|2800","JPG La Femme Le Parfum|w|1800|3400","Tom Ford Black Orchid EDP|u|2000|4000","Parfums de Marly Layton|u|3000|6000","Viktor & Rolf Spicebomb Extreme|m|1500|2800","Stronger With You Intensely|m|1600|3100","Givenchy Gentleman Reserve Privée|m|1600|3000","Hermès Terre d’Hermès EDT|m|1400|2600","Nishane Hacivat|u|2500|4800"];
const products = RAW.map((r, i) => { const a = r.split("|"); return { id: i + 1, name: a[0], slug: slugify(a[0]), gender: GK[a[1]], p5: +a[2], p10: +a[3], active: true, soldOut: false }; });
module.exports = { products };

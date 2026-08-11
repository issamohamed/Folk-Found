// ISO 3166-1 numeric -> alpha-2, restricted to the country geometries present in
// public/geo/countries-50m.json. Generated once from world-countries@5.0.0; committed
// so the build never depends on the network.
//
// The world-atlas TopoJSON identifies countries only by numeric id, so this table is
// what turns a clicked shape into a folklore region code.

export const ISO_NUMERIC_TO_ALPHA2: Readonly<Record<string, string>> = {
  '004': 'AF', // Afghanistan
  '008': 'AL', // Albania
  '010': 'AQ', // Antarctica
  '012': 'DZ', // Algeria
  '016': 'AS', // American Samoa
  '020': 'AD', // Andorra
  '024': 'AO', // Angola
  '028': 'AG', // Antigua and Barbuda
  '031': 'AZ', // Azerbaijan
  '032': 'AR', // Argentina
  '036': 'AU', // Australia
  '040': 'AT', // Austria
  '044': 'BS', // Bahamas
  '048': 'BH', // Bahrain
  '050': 'BD', // Bangladesh
  '051': 'AM', // Armenia
  '052': 'BB', // Barbados
  '056': 'BE', // Belgium
  '060': 'BM', // Bermuda
  '064': 'BT', // Bhutan
  '068': 'BO', // Bolivia
  '070': 'BA', // Bosnia and Herzegovina
  '072': 'BW', // Botswana
  '076': 'BR', // Brazil
  '084': 'BZ', // Belize
  '086': 'IO', // British Indian Ocean Territory
  '090': 'SB', // Solomon Islands
  '092': 'VG', // British Virgin Islands
  '096': 'BN', // Brunei
  '100': 'BG', // Bulgaria
  '104': 'MM', // Myanmar
  '108': 'BI', // Burundi
  '112': 'BY', // Belarus
  '116': 'KH', // Cambodia
  '120': 'CM', // Cameroon
  '124': 'CA', // Canada
  '132': 'CV', // Cape Verde
  '136': 'KY', // Cayman Islands
  '140': 'CF', // Central African Republic
  '144': 'LK', // Sri Lanka
  '148': 'TD', // Chad
  '152': 'CL', // Chile
  '156': 'CN', // China
  '158': 'TW', // Taiwan
  '170': 'CO', // Colombia
  '174': 'KM', // Comoros
  '178': 'CG', // Republic of the Congo
  '180': 'CD', // DR Congo
  '184': 'CK', // Cook Islands
  '188': 'CR', // Costa Rica
  '191': 'HR', // Croatia
  '192': 'CU', // Cuba
  '196': 'CY', // Cyprus
  '203': 'CZ', // Czechia
  '204': 'BJ', // Benin
  '208': 'DK', // Denmark
  '212': 'DM', // Dominica
  '214': 'DO', // Dominican Republic
  '218': 'EC', // Ecuador
  '222': 'SV', // El Salvador
  '226': 'GQ', // Equatorial Guinea
  '231': 'ET', // Ethiopia
  '232': 'ER', // Eritrea
  '233': 'EE', // Estonia
  '234': 'FO', // Faroe Islands
  '238': 'FK', // Falkland Islands
  '239': 'GS', // South Georgia
  '242': 'FJ', // Fiji
  '246': 'FI', // Finland
  '248': 'AX', // Åland Islands
  '250': 'FR', // France
  '258': 'PF', // French Polynesia
  '260': 'TF', // French Southern and Antarctic Lands
  '262': 'DJ', // Djibouti
  '266': 'GA', // Gabon
  '268': 'GE', // Georgia
  '270': 'GM', // Gambia
  '275': 'PS', // Palestine
  '276': 'DE', // Germany
  '288': 'GH', // Ghana
  '296': 'KI', // Kiribati
  '300': 'GR', // Greece
  '304': 'GL', // Greenland
  '308': 'GD', // Grenada
  '316': 'GU', // Guam
  '320': 'GT', // Guatemala
  '324': 'GN', // Guinea
  '328': 'GY', // Guyana
  '332': 'HT', // Haiti
  '334': 'HM', // Heard Island and McDonald Islands
  '336': 'VA', // Vatican City
  '340': 'HN', // Honduras
  '344': 'HK', // Hong Kong
  '348': 'HU', // Hungary
  '352': 'IS', // Iceland
  '356': 'IN', // India
  '360': 'ID', // Indonesia
  '364': 'IR', // Iran
  '368': 'IQ', // Iraq
  '372': 'IE', // Ireland
  '376': 'IL', // Israel
  '380': 'IT', // Italy
  '384': 'CI', // Ivory Coast
  '388': 'JM', // Jamaica
  '392': 'JP', // Japan
  '398': 'KZ', // Kazakhstan
  '400': 'JO', // Jordan
  '404': 'KE', // Kenya
  '408': 'KP', // North Korea
  '410': 'KR', // South Korea
  '414': 'KW', // Kuwait
  '417': 'KG', // Kyrgyzstan
  '418': 'LA', // Laos
  '422': 'LB', // Lebanon
  '426': 'LS', // Lesotho
  '428': 'LV', // Latvia
  '430': 'LR', // Liberia
  '434': 'LY', // Libya
  '438': 'LI', // Liechtenstein
  '440': 'LT', // Lithuania
  '442': 'LU', // Luxembourg
  '446': 'MO', // Macau
  '450': 'MG', // Madagascar
  '454': 'MW', // Malawi
  '458': 'MY', // Malaysia
  '462': 'MV', // Maldives
  '466': 'ML', // Mali
  '470': 'MT', // Malta
  '478': 'MR', // Mauritania
  '480': 'MU', // Mauritius
  '484': 'MX', // Mexico
  '492': 'MC', // Monaco
  '496': 'MN', // Mongolia
  '498': 'MD', // Moldova
  '499': 'ME', // Montenegro
  '500': 'MS', // Montserrat
  '504': 'MA', // Morocco
  '508': 'MZ', // Mozambique
  '512': 'OM', // Oman
  '516': 'NA', // Namibia
  '520': 'NR', // Nauru
  '524': 'NP', // Nepal
  '528': 'NL', // Netherlands
  '531': 'CW', // Curaçao
  '533': 'AW', // Aruba
  '534': 'SX', // Sint Maarten
  '540': 'NC', // New Caledonia
  '548': 'VU', // Vanuatu
  '554': 'NZ', // New Zealand
  '558': 'NI', // Nicaragua
  '562': 'NE', // Niger
  '566': 'NG', // Nigeria
  '570': 'NU', // Niue
  '574': 'NF', // Norfolk Island
  '578': 'NO', // Norway
  '580': 'MP', // Northern Mariana Islands
  '583': 'FM', // Micronesia
  '584': 'MH', // Marshall Islands
  '585': 'PW', // Palau
  '586': 'PK', // Pakistan
  '591': 'PA', // Panama
  '598': 'PG', // Papua New Guinea
  '600': 'PY', // Paraguay
  '604': 'PE', // Peru
  '608': 'PH', // Philippines
  '612': 'PN', // Pitcairn Islands
  '616': 'PL', // Poland
  '620': 'PT', // Portugal
  '624': 'GW', // Guinea-Bissau
  '626': 'TL', // Timor-Leste
  '630': 'PR', // Puerto Rico
  '634': 'QA', // Qatar
  '642': 'RO', // Romania
  '643': 'RU', // Russia
  '646': 'RW', // Rwanda
  '652': 'BL', // Saint Barthélemy
  '654': 'SH', // Saint Helena, Ascension and Tristan da Cunha
  '659': 'KN', // Saint Kitts and Nevis
  '660': 'AI', // Anguilla
  '662': 'LC', // Saint Lucia
  '663': 'MF', // Saint Martin
  '666': 'PM', // Saint Pierre and Miquelon
  '670': 'VC', // Saint Vincent and the Grenadines
  '674': 'SM', // San Marino
  '678': 'ST', // São Tomé and Príncipe
  '682': 'SA', // Saudi Arabia
  '686': 'SN', // Senegal
  '688': 'RS', // Serbia
  '690': 'SC', // Seychelles
  '694': 'SL', // Sierra Leone
  '702': 'SG', // Singapore
  '703': 'SK', // Slovakia
  '704': 'VN', // Vietnam
  '705': 'SI', // Slovenia
  '706': 'SO', // Somalia
  '710': 'ZA', // South Africa
  '716': 'ZW', // Zimbabwe
  '724': 'ES', // Spain
  '728': 'SS', // South Sudan
  '729': 'SD', // Sudan
  '732': 'EH', // Western Sahara
  '740': 'SR', // Suriname
  '748': 'SZ', // Eswatini
  '752': 'SE', // Sweden
  '756': 'CH', // Switzerland
  '760': 'SY', // Syria
  '762': 'TJ', // Tajikistan
  '764': 'TH', // Thailand
  '768': 'TG', // Togo
  '776': 'TO', // Tonga
  '780': 'TT', // Trinidad and Tobago
  '784': 'AE', // United Arab Emirates
  '788': 'TN', // Tunisia
  '792': 'TR', // Turkey
  '795': 'TM', // Turkmenistan
  '796': 'TC', // Turks and Caicos Islands
  '800': 'UG', // Uganda
  '804': 'UA', // Ukraine
  '807': 'MK', // North Macedonia
  '818': 'EG', // Egypt
  '826': 'GB', // United Kingdom
  '831': 'GG', // Guernsey
  '832': 'JE', // Jersey
  '833': 'IM', // Isle of Man
  '834': 'TZ', // Tanzania
  '840': 'US', // United States
  '850': 'VI', // United States Virgin Islands
  '854': 'BF', // Burkina Faso
  '858': 'UY', // Uruguay
  '860': 'UZ', // Uzbekistan
  '862': 'VE', // Venezuela
  '876': 'WF', // Wallis and Futuna
  '882': 'WS', // Samoa
  '887': 'YE', // Yemen
  '894': 'ZM', // Zambia
};

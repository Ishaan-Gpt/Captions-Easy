/**
 * Golden list: Devanagari -> the Roman spelling Indian creators most commonly type. Written by hand as the reference
 * (not generated from the romanizer). Where creators split between spellings the commonest one is listed and the
 * alternatives after "|" also count as correct ("chhota|chota").
 */
export const ROMANIZE_GOLDEN: [string, string][] = [
  // spec examples
  ["पहले", "pehle"], ["चलते थे", "chalte the"], ["करते हैं", "karte hain"], ["क्या", "kya"], ["नहीं", "nahi|nahin"],
  ["बहुत", "bahut"], ["अच्छा", "achha|accha|acha"], ["ज़िंदगी", "zindagi"], ["मुझे", "mujhe"], ["हम", "hum"], ["यार", "yaar"],
  ["मतलब", "matlab"], ["भाई", "bhai"],
  // everyday words
  ["है", "hai"], ["हैं", "hain"], ["था", "tha"], ["थी", "thi"], ["मैं", "main"], ["में", "mein"], ["और", "aur"],
  ["लेकिन", "lekin"], ["क्योंकि", "kyunki|kyuki"], ["कैसे", "kaise"], ["कहाँ", "kahan"], ["यहाँ", "yahan"], ["वहाँ", "wahan|vahan"],
  ["कभी", "kabhi"], ["अभी", "abhi"], ["सब", "sab"], ["कुछ", "kuch|kuchh"], ["कोई", "koi"], ["किसी", "kisi"], ["आज", "aaj"],
  ["कल", "kal"], ["फिर", "phir|fir"], ["सही", "sahi"], ["ग़लत", "galat"], ["ठीक", "theek|thik"], ["बिल्कुल", "bilkul"],
  ["ज़रूर", "zaroor|jaroor"], ["शायद", "shayad"], ["दोस्त", "dost"], ["दुनिया", "duniya"], ["दिल", "dil"], ["प्यार", "pyaar|pyar"],
  ["बात", "baat"], ["काम", "kaam"], ["नाम", "naam"], ["समय", "samay"], ["वक़्त", "waqt"], ["दिन", "din"], ["रात", "raat"],
  ["साल", "saal"], ["घर", "ghar"], ["पैसे", "paise"], ["लोग", "log"], ["लोगों", "logon"], ["बच्चे", "bacche|bachche"],
  ["लड़का", "ladka"], ["लड़की", "ladki"], ["आदमी", "aadmi"], ["तुम", "tum"], ["आप", "aap"], ["अपना", "apna"],
  ["हमारा", "hamara"], ["तुम्हारा", "tumhara"], ["उसका", "uska"], ["इसलिए", "isliye"], ["चाहिए", "chahiye"],
  ["गया", "gaya"], ["गए", "gaye"], ["किया", "kiya"], ["दिया", "diya"], ["लिया", "liya"], ["हुआ", "hua"], ["हुए", "hue"],
  ["होगा", "hoga"], ["रहा", "raha"], ["रही", "rahi"], ["सकता", "sakta"], ["सकते", "sakte"], ["करना", "karna"], ["करो", "karo"],
  ["देखो", "dekho"], ["सुनो", "suno"], ["चलो", "chalo"], ["बोलो", "bolo"], ["समझ", "samajh"], ["पता", "pata"],
  ["कहना", "kehna"], ["रहना", "rehna"], ["यह", "yeh"], ["वो", "wo|woh|vo"], ["ये", "ye"], ["तो", "to"], ["भी", "bhi"],
  ["ही", "hi"], ["को", "ko"], ["से", "se"], ["पर", "par"], ["का", "ka"], ["की", "ki"], ["के", "ke"], ["ने", "ne"],
  ["एक", "ek"], ["दो", "do"], ["तीन", "teen"], ["साथ", "saath|sath"], ["पास", "paas|pas"], ["अंदर", "andar"], ["बाहर", "bahar|baahar"],
  ["नीचे", "neeche|niche"], ["पीछे", "peeche|piche"], ["आगे", "aage"], ["हमेशा", "hamesha"], ["ज़्यादा", "zyada|jyada"],
  ["थोड़ा", "thoda"], ["बड़ा", "bada"], ["छोटा", "chhota|chota"], ["नया", "naya"], ["सपना", "sapna"], ["कहानी", "kahani"],
  ["पानी", "paani|pani"], ["खाना", "khana|khaana"],
  // words the dictionary does not list (rules only)
  ["समझना", "samajhna"], ["समझते", "samajhte"], ["लगता", "lagta"], ["बदलना", "badalna"], ["मिलकर", "milkar"], ["उसने", "usne"],
  ["अपने", "apne"], ["सबसे", "sabse"], ["रखना", "rakhna"], ["बोलना", "bolna"], ["देखना", "dekhna"], ["पढ़ना", "padhna|parhna"],
  ["लिखना", "likhna"], ["सोचना", "sochna"], ["मेहनत", "mehnat"], ["महसूस", "mehsoos|mehsus|mahsoos"], ["पहला", "pehla"],
  ["कहते", "kehte"], ["रहते", "rehte"], ["बेहतर", "behtar"], ["सुबह", "subah"], ["जगह", "jagah"], ["तरह", "tarah"],
  ["अगर", "agar"], ["असर", "asar"], ["नज़र", "nazar"], ["हमला", "hamla"], ["पकड़", "pakad"], ["बदल", "badal"], ["कमल", "kamal"],
  ["लगभग", "lagbhag"], ["हिम्मत", "himmat"], ["इज़्ज़त", "izzat"], ["मौका", "mauka"], ["कौन", "kaun"], ["ख़्याल", "khayal|khyaal|khyal"],
  ["ध्यान", "dhyaan|dhyan"], ["ज्ञान", "gyaan|gyan"], ["परीक्षा", "pariksha"], ["रास्ता", "raasta|rasta"], ["बाज़ार", "bazaar|bazar"],
  ["इंतज़ार", "intezaar|intazaar|intzaar"], ["दिमाग़", "dimaag|dimag"], ["इंसान", "insaan|insan"], ["सरकार", "sarkaar|sarkar"],
  ["लंबा", "lamba"], ["हिंदी", "hindi"], ["गंगा", "ganga"], ["संभालना", "sambhalna|sambhaalna"], ["चीज़ें", "cheezein|cheezen"],
  ["बातें", "baatein|baaten"], ["हमें", "humein|hamein|hume"], ["तुम्हें", "tumhe|tumhein"], ["उन्हें", "unhe|unhein"],
  ["दोस्तों", "doston"], ["शहर", "shehar|shahar"], ["बहन", "behen|bahan"], ["गाँव", "gaon|gaanv"], ["जाओ", "jao"], ["आओ", "aao"],
  ["जाइए", "jaiye"], ["आइए", "aaiye"], ["कीजिए", "kijiye|keejiye"], ["दिखाई", "dikhai"], ["कमाई", "kamai"], ["लड़ाई", "ladai"],
  ["पढ़ाई", "padhai"], ["सच्चाई", "sacchai|sachai"], ["बच्चा", "baccha|bachcha"], ["इच्छा", "ichha|iccha"], ["पक्का", "pakka"],
  ["क्षमा", "kshama"], ["कृपया", "kripya|kripaya"], ["विश्वास", "vishwas|vishvas"], ["द्वारा", "dwara"], ["स्वाद", "swaad|swad"],
  ["वजह", "wajah|vajah"], ["वाला", "wala|waala"], ["वापस", "wapas"], ["वीडियो", "video"], ["फ़ोन", "phone"],
  ["दूसरा", "doosra|dusra"], ["ज़रूरी", "zaroori|jaruri"], ["फूल", "phool"], ["धूप", "dhoop"], ["तू", "tu"],
  ["जानकर", "jaankar|jankar"], ["मानता", "maanta|manta"], ["चाहता", "chahta"], ["नौकरी", "naukri"], ["कोशिश", "koshish"],
  ["ख़ुश", "khush"], ["ख़बर", "khabar"], ["फ़र्क", "farak|fark"], ["फ़ैसला", "faisla"], ["क़ीमत", "keemat|qeemat|kimat"],
  ["मुझसे", "mujhse"], ["तुमसे", "tumse"], ["किसने", "kisne"], ["जिसने", "jisne"], ["जिसका", "jiska"], ["उनका", "unka"],
  ["बिलकुल", "bilkul"], ["सिर्फ़", "sirf"], ["हर", "har"], ["हरदम", "hardam"], ["चलना", "chalna"], ["निकलना", "nikalna"],
  ["निकल", "nikal"], ["पहुँच", "pahunch"], ["पहुँचना", "pahunchna"], ["उठना", "uthna"], ["बैठना", "baithna"], ["खेलना", "khelna"],
  // phrases
  ["तुम कैसे हो", "tum kaise ho"], ["मुझे नहीं पता", "mujhe nahi pata|mujhe nahin pata"], ["क्या हाल है", "kya haal hai"],
  ["चलो शुरू करते हैं", "chalo shuru karte hain"], ["बहुत अच्छा", "bahut achha|bahut accha"], ["सब ठीक है", "sab theek hai|sab thik hai"],
  ["मैं घर जा रहा हूँ", "main ghar ja raha hoon|main ghar ja raha hu"], ["ये वीडियो देखो", "ye video dekho"],
  ["हम पहले ऐसे करते थे", "hum pehle aise karte the"], ["ज़िंदगी में कुछ भी हो सकता है", "zindagi mein kuch bhi ho sakta hai"],
  ["यार, ये तो कमाल है!", "yaar, ye to kamaal hai!|yaar, ye to kamal hai!"], ["दस मिनट में", "das minute mein|das minat mein"],
];

/**
 * Held-out list: written after the rules were frozen and never tuned against, to measure how the rules generalize
 * beyond the words they were designed around (reported separately).
 */
export const ROMANIZE_HELDOUT: [string, string][] = [
  ["मुस्कुराना", "muskurana"], ["खिड़की", "khidki"], ["दरवाज़ा", "darwaza"], ["किताब", "kitaab|kitab"], ["कुर्सी", "kursi"],
  ["तस्वीर", "tasveer|tasvir"], ["आसमान", "aasman|aasmaan"], ["बारिश", "baarish|barish"], ["गर्मी", "garmi"], ["सर्दी", "sardi"],
  ["हवा", "hawa"], ["चाय", "chai|chaay"], ["दूध", "doodh"], ["रोटी", "roti"], ["सब्ज़ी", "sabzi"], ["मिठाई", "mithai"],
  ["त्योहार", "tyohaar|tyohar"], ["शादी", "shaadi|shadi"], ["दुल्हन", "dulhan"], ["परिवार", "parivaar|pariwar|parivar"],
  ["रिश्ता", "rishta"], ["भरोसा", "bharosa"], ["धोखा", "dhokha"], ["इरादा", "iraada|irada"], ["कोशिशें", "koshishein|koshishen"],
  ["उम्मीद", "umeed|ummeed"], ["मंज़िल", "manzil"], ["ताक़त", "taakat|taqat|taaqat"], ["कमज़ोर", "kamzor"], ["मज़बूत", "mazboot"],
  ["जल्दी", "jaldi"], ["धीरे", "dheere|dhire"], ["अचानक", "achanak"], ["बेवकूफ़", "bewakoof|bewakuf"], ["समझदार", "samajhdaar|samajhdar"],
  ["पागल", "paagal|pagal"], ["मज़ेदार", "mazedaar|mazedar"], ["शानदार", "shaandaar|shandar|shaandar"], ["ख़तरनाक", "khatarnak|khatarnaak"],
  ["बेचारा", "bechara|bechaara"], ["सुनना", "sunna"], ["समझाना", "samjhana"], ["बताना", "batana"], ["बताओ", "batao"], ["पूछना", "poochna|puchna"],
  ["भूलना", "bhoolna|bhulna"], ["छोड़ना", "chhodna|chodna"], ["जीतना", "jeetna"], ["हारना", "haarna|harna"], ["सीखो", "seekho|sikho"],
  ["बनाते", "banate"], ["लगाओ", "lagao"], ["उठाओ", "uthao"], ["मिलेंगे", "milenge"], ["करेंगे", "karenge"], ["देखेंगे", "dekhenge"],
  ["सुबह-शाम", "subah-shaam|subah-sham"], ["बार-बार", "baar-baar|bar-bar"], ["धीरे-धीरे", "dheere-dheere|dhire-dhire"], ["२०२४ में", "2024 mein"],
];

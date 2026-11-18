/**
 * Frequent Hindi words in the Roman spelling Indian creators actually type (Hinglish), used before the rules.
 * Format: "देवनागरी=roman" separated by whitespace ("_" = space). Lookup ignores nukta and ँ/ं differences, so
 * "ज़िंदगी" and "जिंदगी", "हाँ" and "हां" share one entry. Listed: pronouns, auxiliaries, postpositions, question
 * words, frequent verbs/nouns/adjectives where the rules alone pick a less common spelling, and the commonest
 * English loanwords written in Devanagari (वीडियो -> video).
 */
export const HINGLISH_EXCEPTIONS = `
है=hai हैं=hain हूँ=hoon हूं=hoon हो=ho था=tha थी=thi थे=the थीं=thi
मैं=main मै=main मुझे=mujhe मुझको=mujhko मुझसे=mujhse मेरा=mera मेरी=meri मेरे=mere
हम=hum हमें=humein हमको=humko हमने=humne हमारा=hamara हमारी=hamari हमारे=hamare हमसे=humse
तुम=tum तुम्हें=tumhe तुमको=tumko तुमने=tumne तुम्हारा=tumhara तुम्हारी=tumhari तुम्हारे=tumhare तुमसे=tumse
तू=tu तुझे=tujhe तेरा=tera तेरी=teri तेरे=tere
आप=aap आपको=aapko आपने=aapne आपका=aapka आपकी=aapki आपके=aapke आपसे=aapse
वह=woh वो=wo वे=ve यह=yeh ये=ye इसे=ise उसे=use इसका=iska उसका=uska इसकी=iski उसकी=uski इसके=iske उसके=uske
उन्हें=unhe इन्हें=inhe उन्होंने=unhone इन्होंने=inhone उनका=unka उनकी=unki उनके=unke इनका=inka इनकी=inki
उसने=usne इसने=isne उनको=unko इनको=inko उस=us इस=is उन=un इन=in
अपना=apna अपनी=apni अपने=apne खुद=khud ख़ुद=khud
कि=ki की=ki का=ka के=ke को=ko से=se में=mein पर=par ने=ne तक=tak लिए=liye लिये=liye
और=aur या=ya लेकिन=lekin पर=par मगर=magar तो=to भी=bhi ही=hi सिर्फ=sirf सिर्फ़=sirf बस=bas
क्या=kya क्यों=kyun क्यूं=kyun क्यूँ=kyun क्योंकि=kyunki कैसे=kaise कैसा=kaisa कैसी=kaisi कहाँ=kahan कहां=kahan
कब=kab कौन=kaun किसने=kisne किसको=kisko किसका=kiska कितना=kitna कितनी=kitni कितने=kitne कोई=koi कुछ=kuch
नहीं=nahi नही=nahi ना=na न=na मत=mat हाँ=haan हां=haan जी=ji जी_हाँ=ji_haan
यहाँ=yahan यहां=yahan वहाँ=wahan वहां=wahan जहाँ=jahan जहां=jahan
अब=ab जब=jab तब=tab सब=sab सबको=sabko सबसे=sabse सभी=sabhi कभी=kabhi अभी=abhi तभी=tabhi जभी=jabhi
आज=aaj कल=kal परसों=parson हमेशा=hamesha फिर=phir फिरसे=phirse दोबारा=dobara पहले=pehle बाद=baad
बहुत=bahut ज़्यादा=zyada ज्यादा=zyada कम=kam थोड़ा=thoda थोड़ी=thodi थोड़े=thode पूरा=poora पूरी=poori सारा=saara सारे=saare
अच्छा=achha अच्छी=achhi अच्छे=achhe बुरा=bura बड़ा=bada बड़ी=badi बड़े=bade छोटा=chhota छोटी=chhoti छोटे=chhote
नया=naya नई=nayi नए=naye पुराना=purana सही=sahi ग़लत=galat गलत=galat ठीक=theek बिल्कुल=bilkul ज़रूर=zaroor ज़रूरी=zaroori
सच=sach सच्चा=saccha सच्ची=sacchi शायद=shayad पक्का=pakka असली=asli आसान=aasan मुश्किल=mushkil
ज़िंदगी=zindagi ज़िन्दगी=zindagi दुनिया=duniya दिल=dil प्यार=pyaar यार=yaar भाई=bhai बहन=behen दोस्त=dost दोस्तों=doston
माँ=maa मां=maa पापा=papa मम्मी=mummy बेटा=beta बेटी=beti बच्चा=baccha बच्चे=bacche बच्चों=bacchon लोग=log लोगों=logon
लड़का=ladka लड़की=ladki लड़के=ladke आदमी=aadmi औरत=aurat दीदी=didi भैया=bhaiya
मतलब=matlab बात=baat बातें=baatein काम=kaam नाम=naam समय=samay वक़्त=waqt वक्त=waqt टाइम=time दिन=din रात=raat साल=saal
चीज़=cheez चीज=cheez चीज़ें=cheezein पैसा=paisa पैसे=paise घर=ghar गाँव=gaon गांव=gaon शहर=shehar देश=desh
सपना=sapna सपने=sapne ख़ुशी=khushi खुशी=khushi दुख=dukh दुःख=dukh डर=dar गुस्सा=gussa मज़ा=maza मजा=maza
तरह=tarah तरीका=tarika तरीक़ा=tarika वजह=wajah जगह=jagah बारे=baare सवाल=sawaal जवाब=jawab
रास्ता=raasta रास्ते=raaste सफ़र=safar मंज़िल=manzil कहानी=kahani गाना=gaana खाना=khana पानी=paani
करना=karna करो=karo करें=karein करते=karte करता=karta करती=karti करके=karke किया=kiya किए=kiye की_थी=ki_thi
होना=hona होता=hota होती=hoti होते=hote होगा=hoga होगी=hogi होंगे=honge हुआ=hua हुई=hui हुए=hue
जाना=jaana जाता=jaata जाती=jaati जाते=jaate जाओ=jao जाएगा=jayega गया=gaya गई=gayi गए=gaye गयी=gayi
आना=aana आता=aata आती=aati आते=aate आओ=aao आया=aaya आई=aayi आए=aaye आएगा=aayega
देना=dena देता=deta दिया=diya दी=di दो=do लेना=lena लिया=liya ली=li लो=lo
कहना=kehna कहा=kaha कहते=kehte कहता=kehta कहती=kehti बोलना=bolna बोला=bola बोले=bole बोलो=bolo
रहना=rehna रहा=raha रही=rahi रहे=rahe रहता=rehta रहती=rehti रहते=rehte
सकता=sakta सकती=sakti सकते=sakte चाहिए=chahiye चाहता=chahta चाहती=chahti चाहते=chahte
देखो=dekho देखा=dekha देखना=dekhna सुनो=suno सुना=suna समझ=samajh समझो=samjho समझना=samajhna
चलो=chalo चलते=chalte चलता=chalta चला=chala लगता=lagta लगती=lagti लगा=laga लगे=lage मिला=mila मिलता=milta
बना=bana बनाना=banana बनाओ=banao सोचो=socho सोचा=socha पता=pata पढ़ना=padhna सीखना=seekhna
इसलिए=isliye इसलिये=isliye ताकि=taaki जैसे=jaise जैसा=jaisa वैसे=waise वैसा=waisa ऐसे=aise ऐसा=aisa ऐसी=aisi
साथ=saath पास=paas अंदर=andar बाहर=bahar ऊपर=upar नीचे=neeche आगे=aage पीछे=peeche बीच=beech
एक=ek दो=do तीन=teen चार=chaar पांच=paanch पाँच=paanch छह=chhe सात=saat आठ=aath नौ=nau दस=das सौ=sau हज़ार=hazaar लाख=lakh करोड़=crore
पहला=pehla पहली=pehli दूसरा=doosra दूसरी=doosri आख़िर=aakhir आखिर=aakhir आखिरी=aakhiri
शुरू=shuru ख़त्म=khatam खत्म=khatam शुक्रिया=shukriya धन्यवाद=dhanyawad नमस्ते=namaste नमस्कार=namaskar
भगवान=bhagwan जय=jai हिंदी=hindi हिन्दी=hindi भारत=bharat हिंदुस्तान=hindustan
वीडियो=video फ़ोन=phone फोन=phone सोशल=social मीडिया=media कंटेंट=content चैनल=channel सब्सक्राइब=subscribe
लाइक=like शेयर=share कमेंट=comment फॉलो=follow इंस्टाग्राम=instagram यूट्यूब=youtube ऐप=app मोबाइल=mobile
बिज़नेस=business बिजनेस=business मार्केटिंग=marketing प्रॉब्लम=problem आइडिया=idea लाइफ=life लाइफ़=life
ऑफिस=office ऑफ़िस=office कॉलेज=college स्कूल=school सॉरी=sorry प्लीज़=please प्लीज=please थैंक्स=thanks
ओके=ok हेलो=hello हैलो=hello बाय=bye गाइज़=guys गाइज=guys टीम=team बेस्ट=best स्टार्ट=start मूवी=movie
मैंने=maine महीने=mahine महीना=mahina खरीदा=kharida ख़रीदा=kharida खरीदना=kharidna
ट्रिक=trick लास्ट=last फर्स्ट=first सरप्राइज़=surprise सरप्राइज=surprise ऑनेस्टली=honestly बैटरी=battery बैकअप=backup
फेमस=famous ट्राई=try टेस्ट=test एंड=end प्रोडक्ट=product रिव्यू=review लिंक=link डिस्क्रिप्शन=description बायो=bio
पोस्ट=post रील=reel रील्स=reels शॉर्ट्स=shorts ट्रेंड=trend ट्रेंडिंग=trending वायरल=viral फॉलोअर्स=followers
क्रिएटर=creator एडिट=edit एडिटिंग=editing कैमरा=camera फोटो=photo सेल्फी=selfie डेली=daily टिप्स=tips
हैक=hack सीक्रेट=secret ऑफर=offer सेल=sale फ्री=free ऑनलाइन=online ऑफलाइन=offline इंटरनेट=internet
सुपर=super एक्चुअली=actually बेसिकली=basically सीरियसली=seriously लिटरली=literally ओवर=over स्टोरी=story
`;

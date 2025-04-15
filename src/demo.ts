// suche in nextcloud kontakten nach telefonnummern
// schaue ob du in Notion zum entsprchenden Namen findest
//   wenn ja, aber telefonnummer leer, dann ergänzen
//   wenn ja, aber telefonnummer nicht leer, dann überspringen
//   wenn nein, dann überspringen

import { NextcloudContactMapper, NextcloudContactService } from "./contacts";

const nextcloudContactMapper = new NextcloudContactMapper();

const nextcloudContactService = new NextcloudContactService(nextcloudContactMapper);

(async () => {
  const contacts = await nextcloudContactService.getContacts(
    "https://nextcloud.oliverlorenz.com",
    "oliverlorenz",
    "L39AL-C2EjE-3EySC-CMtKK-ZGxDn",
    'contacts'
  );

  console.log(contacts);
})();
/**
 * Webhook Meltin — met à jour la colonne AGENT dans le planning Google Sheet.
 *
 * Installation :
 * 1. Ouvrir le Google Sheet planning > Extensions > Apps Script
 * 2. Coller ce fichier, enregistrer
 * 3. Exécuter `setupWebhookSecret` une fois (autoriser le script)
 *    → copier le secret affiché dans les logs (Affichage > Journaux d'exécution)
 * 4. Déployer > Nouvelle version > Application web :
 *    - Exécuter en tant que : Moi
 *    - Qui a accès : Tout le monde
 * 5. Copier l'URL de déploiement dans GOOGLE_SHEETS_WEBHOOK_URL (.env)
 * 6. Mettre le même secret dans GOOGLE_SHEETS_WEBHOOK_SECRET (.env)
 */

function setupWebhookSecret() {
  var secret =
    "meltin-" +
    Utilities.getUuid().replace(/-/g, "").slice(0, 24);
  PropertiesService.getScriptProperties().setProperty(
    "WEBHOOK_SECRET",
    secret
  );
  Logger.log("GOOGLE_SHEETS_WEBHOOK_SECRET=" + secret);
}

function doPost(e) {
  try {
    var expected = PropertiesService.getScriptProperties().getProperty(
      "WEBHOOK_SECRET"
    );
    if (!e || !e.postData || !e.postData.contents) {
      return jsonResponse({ ok: false, error: "Body vide." });
    }

    var body = JSON.parse(e.postData.contents);
    if (!expected || body.secret !== expected) {
      return jsonResponse({ ok: false, error: "Non autorisé." });
    }

    var spreadsheetId = String(body.spreadsheetId || "").trim();
    var tabName = String(body.tabName || "Feuille 1").trim();
    var rowNumber = Number(body.rowNumber);
    var columnNumber = Number(body.columnNumber);
    var value = body.value == null ? "" : String(body.value);

    if (!spreadsheetId || !rowNumber || !columnNumber) {
      return jsonResponse({
        ok: false,
        error: "Paramètres requis : spreadsheetId, rowNumber, columnNumber.",
      });
    }

    var ss = SpreadsheetApp.openById(spreadsheetId);
    var sheet = ss.getSheetByName(tabName);
    if (!sheet) {
      return jsonResponse({
        ok: false,
        error: "Onglet introuvable : " + tabName,
      });
    }

    var cell = sheet.getRange(rowNumber, columnNumber);
    cell.setValue(value);

    return jsonResponse({
      ok: true,
      updatedRange: sheet.getName() + "!" + cell.getA1Notation(),
      rowNumber: rowNumber,
    });
  } catch (err) {
    return jsonResponse({
      ok: false,
      error: String(err && err.message ? err.message : err),
    });
  }
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}

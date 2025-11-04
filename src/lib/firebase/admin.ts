import * as admin from 'firebase-admin';

const serviceAccount = {
  project_id: "carehub-a5e11",
  private_key_id: "1a5ec2bf5d2d739d001385604cb38f4a67ef8450",
  private_key: "-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQCxZ1LvgBo+NPez\nk8aJMcnxTKl4KsTvjBkbzpXL4gHfzLEocAx6sNW0DaQ6TPTSpTcPzYwRXSNJTTjA\nTVRMnF4swGfMuK8SulnAaljIfm7UDm01NMGA9GFIQh8AF9StGwDvcn2hg9mXLkzI\nv9OuWh78vvvzek7BI7olonjTCPA1Zsylk/dr7AQcW5nTTpC4/IC/4m1LJK8XnO0C\newt4QmWWNgupmA5AsK3EumSYXVfP7dBnk4xEJB+HvUErAUzChxtw9oyfq7Hxcp9C\nYkYmmrG4h/ncBb9zb3Xlq1IkZ2DhRSbEXnJERfWiHODPXMnvAz8mqMBQjkVsuYNl\nWHbRMk7DAgMBAAECggEAG9mHneJIvGPzpYpZDD1NDDInwfNHj/+OCt0nNlGYT7pC\nRCyK7lEydfNU88i+/7lAvUdcaiFqol2av32kR+lIU32FDhDJfdwpWNlDxNMsXOKY\nPFZi26FXCvvuV++7IHhxG3tSw6H/l7SEs1iB8l4NfUoSIt/xhcUxD4AZDbAv3YIE\nlVhrIKmo5EkOWC/uXbMeHcyep3UWu9D3aBNTlxEcH30v1Ir1d54pbdfaBV8RaDJ6\nwGbPgX1R07DMSw2IuaFDu9U3duLPLqbhpO++PdGwvX1C+CCO10rx+xGduc9W5jXE\n+TZOR84KIKlhaxXbWTAdzLFYyHiJxK+nNdguzbh1sQKBgQDddL9fNEhrSWtadZ2I\n+A0q1sEX59hY5ddZ7qqatIaANKcinq7kiW9mmKyAwwbgnbBYZT7088HUfL5p90Yp\ndG484uiynCap9AMu2GsuKuYjXc0pZNxdw2Ijo9ADupgoq5qsWjOuiXVHTMIYexp2\nbyhSSexByucir6j4k8AgVQx1aQKBgQDNE3XwGborEYLXAKP4QtFubAs8HzN3SmNZ\naCoXpF9xvskT6ee6UaK1aPOTbqlt923Kvx3xaAB40XwRDsbDenAoFrXXydGI+ltJ\nASZ3M/uoD9mMqL1NBbYeJQDAWSUSVUAIywtiOpZf4tt7PVw8FXZgCkBLJwZa83Bo\ntX4trhKBSwKBgQCxK2i7MunJI3jGaxg4bzKhliPvCyXToTXTlhRZJpoAUZ9xHACR\nh75fFz/S17RV2PIvFfjzIVxtscrondI88hALmAFQe4qXJ0ewn6XHzrxFiRLMzgta\n3ChUmQafJRX8W6Wnw5ZbSU9RVoBl836tR6q7graHwFuALYaCMDph44jPGQKBgQC/\n2I3DMH4tnjMVaX77V57OuvqDovilhwyL7ls6RMYZBY7cNzxV29rn9Kew65xKyGaI\nfePIGzAd1nNHDdi5tAfKKPyyQxXnG7ZcBFx0tUeegD1XTd/Rdx9Y8erTBlIc5W2D\nDFe46/ATAYmrr8piVv2neM+OvpI+cXBeNDM3Dpo3IwKBgACgU46G55ul7NiceKYC\nyZ+gXudblE6rJAj4ClWUPTcQFNzSEVg0ctC9uJVQzzP/Kue1htbWy/XuU0t7VaKr\ncfVVrigRsDofK0jhxSRd7x369CSBAKeStuKHsqv6XJyjjq8Zx0mFOeUYpVDgwS4S\nhO/DkXINN9j5mngiDDBIzGOv\n-----END PRIVATE KEY-----\n",
  client_email: "firebase-adminsdk-fbsvc@carehub-a5e11.iam.gserviceaccount.com",
  client_id: "100370730644409457176",
  auth_uri: "https://accounts.google.com/o/oauth2/auth",
  token_uri: "https://oauth2.googleapis.com/token",
  auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
  client_x509_cert_url: "https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk-fbsvc%40carehub-a5e11.iam.gserviceaccount.com",
  universe_domain: "googleapis.com"
};

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount as any),
    databaseURL: "https://carehub-a5e11-default-rtdb.firebaseio.com"
  });
}

export default admin;

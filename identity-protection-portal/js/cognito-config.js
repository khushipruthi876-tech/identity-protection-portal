// -----------------------------------------------------------
// AWS Cognito configuration
// These values are safe to expose in frontend code —
// they are public identifiers, not secrets.
// -----------------------------------------------------------

const COGNITO_CONFIG = {
  UserPoolId: "ap-south-1_lwdrKjbEp",   // Your User Pool ID
  ClientId: "684rkfni0u816llttihehdjcnv" // Your App Client ID
};

const userPool = new AmazonCognitoIdentity.CognitoUserPool(COGNITO_CONFIG);

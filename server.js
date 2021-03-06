const path = require('path');
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const jsonWebToken = require('jsonwebtoken');
const { GraphQLClient, gql } = require('graphql-request');

const PORT = process.env.PORT || 8080
const HASURA_JWT_SECRETE_KEY = 'Qk9kQ037bFtsa1E0kOUgzU2akr78N59V';
const HASURA_ENDPOINT = 'https://kepler-data-center.hasura.app/v1/graphql';
const HASURA_GHOST_TOKEN = jsonWebToken.sign({
  "https://hasura.io/jwt/claims": {
      "x-hasura-allowed-roles": ["admin", "user", "guest", "ghost"],
      "x-hasura-default-role": "ghost",
      "x-hasura-user-id": "ghost"
  }
}, HASURA_JWT_SECRETE_KEY, { algorithm: 'HS256', noTimestamp: true });

const client = new GraphQLClient(HASURA_ENDPOINT, {
  headers: {
    'Authorization': `Bearer ${HASURA_GHOST_TOKEN}`
  }
});

const GQL_GET_TOKEN = gql`
query MyQuery($token: String!) {
  signal_db_privileges(where: {user_token: {_eq: $token} }) {
    id, user_token, role
  }
}
`;

const GQL_INSERT_TOKEN = gql`
mutation($token: String!) {
  insert_signal_db_privileges_one(
    object: {
      user_token: $token
    }
  ) {
    id
    user_token
    role
  }
}
`;

const generateJWT = ({ role, user_token }) => {
  return jsonWebToken.sign({
      "https://hasura.io/jwt/claims": {
          "x-hasura-allowed-roles": ["admin", "user", "guest"],
          "x-hasura-default-role": role,
          "x-hasura-user-id": user_token
      }
  }, HASURA_JWT_SECRETE_KEY, { algorithm: 'HS256', noTimestamp: true });
};

const app = express();

app.use(cors());
app.use(express.static(path.join(__dirname, 'dist')));

// parse application/x-www-form-urlencoded
app.use(bodyParser.urlencoded({ extended: false }));

// parse application/json
app.use(bodyParser.json());

app.post('/api/get_token', (req, res) => {
  res.header("Access-Control-Allow-Origin", "*");  
  const userToken = req.body.user_token;
  client
    .request(GQL_GET_TOKEN, { token: userToken })
    .then(data => {
      const user_info = data.signal_db_privileges?.[0];

      if (user_info) {
        const jwt = generateJWT(user_info);
        res.json({ jwt, user_info });
      }
      else {
        client
          .request(GQL_INSERT_TOKEN, { token: userToken })
          .then(data => {
            const user_info = data.insert_signal_db_privileges_one;
            const jwt = generateJWT(user_info);
            res.json({ jwt, user_info });
          });
      }
    })
    .catch(err => console.log(err))
});

app.listen(PORT, () => console.log(`Listening on ${PORT}`))

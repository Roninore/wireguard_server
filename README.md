# WireGuard server
Utility to remote configure your WireGuard server

## API:
### Authorization
```
ERROR STATUS CODES:
    401 - No authorization header (type 'Bearer <TOKEN>')
    402 - Wrong authorization (Wrong token)
```

### Add user
```
POST /add_user
Body { name: <string>}
Response {
    user: {
        name: <str>,
        id: <int>,
        public_key: <str>,
        private_key: <str>
    },
    client_config: <str>
}
STATUS CODES:
    200 - OK
    410 - Bad params (empty or wrong type)
    411 - Unknown error
    412 - Cannot generate keypair
    413 - Cannot find free ID (user count limit reached, maximum 254)
```

### Remove user
```
GET /remove_user
Params { id: <int>}
Response {
    user: {
        name: <str>,
        id: <int>,
        public_key: <str>,
        private_key: <str>
    },
    client_config: <str>
}
STATUS CODES:
    200 - OK
    410 - Bad params (empty or wrong type)
    411 - Unknown error
    412 - User not found
```

### Get users
```
GET /get_users
Response {
    users: [{
        name: <str>,
        id: <int>,
        public_key: <str>,
        private_key: <str>
    }]
}
STATUS CODES:
    200 - OK
```

### Get user
```
GET /get_user
Params { id: <int>}
Response {
    user: {
        name: <str>,
        id: <int>,
        public_key: <str>,
        private_key: <str>
    },
    client_config: <str>
}
STATUS CODES:
    200 - OK
    410 - Bad params (empty or wrong type)
    411 - Unknown error
    412 - User not found
```
const config: ServerConfig = {
    "name": "API-Server",
    "port": 8080,
    
    //"id": "asdf2",
    //"pw": "asdf",
    //"browserLogin": true,

    "expressSettings": {
        "x-powered-by": false
    },

    "bypassAuthorize": [
        "/"
    ]
};

export default config;
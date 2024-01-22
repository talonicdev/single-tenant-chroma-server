# Single Tenant ChromaDB Server

This repository provides a simple single tenant ChromaDB database management system with token validation. ChromaDB clients in Python applications can connect via a single endpoint and perform actions on user-specific database instances. 
Comes with extensive setup scripts for dependency installation/setup, Apache/Nginx and Docker options.

> [!CAUTION]
> This app is still in testing and development. Expect bugs and avoid storing sensitive data in the databases.

## Prerequisites

* Ubuntu Server (Recommended version 20.04 LTS or above)
* Root or sudo permissions on the server
* Git (for cloning this repository)

**For manual installations:**

* NodeJS version 18.14 or above
* Python version 3.8 or above including pip
* PM2 or another process manager
* SQLite version 3.35 or above
* (Optional) Apache or Nginx for web server access

## Installation

### Using the setup script

**1. Clone the repository:**

```git clone https://github.com/talonicdev/single-tenant-chroma-server && cd single-tenant-chroma-server```

**2. Make the setup script executable:**

```chmod +x setup.sh```

**3. Create and edit config.yml:**

```cp config.sample.yml config.yml```

Edit `config.yml` with your editor of choice. Explanations of all settings are provided in the sample config.

**4. Run the setup script:**

```sudo ./setup.sh```

The setup.sh script will automatically install all dependencies, setup a web server and/or docker container (if configured to do so) and start the Node.js application with PM2.

### Manual installation

> [!NOTE]
> This section assumes that you are familiar with NodeJS and Python with common packages and with your web server of choice.

**1. Clone the repository:**

```git clone https://github.com/talonicdev/single-tenant-chroma-server && cd single-tenant-chroma-server```

**2. Install ChromaDB**

```pip install chromadb```

**3. Configure the node app**

The app accepts settings either as arguments, a config.yml or environments variables - in that order.

| Argument/YAML name | ENV name | Type | Description | Default |
| ------------- | ------------- | ------------- | ------------- | ------------- |
| appPort | APP_PORT | int | Port used by the node app. | 8000 |
| authServerEndpoint | AUTH_SERVER_ENDPOINT | string | External endpoint to validate the token against. Needs to return `{userId:string}` or `{ data: { userId:string } }`. Leave empty to treat the token as a pre-validated UUID instead. | *none* |
| authServerAPIKey | AUTH_SERVER_APIKEY | string | Value to send along to the auth server as `x-api-key` header, if any. | *none* |
| dbPath | DB_PATH | string | Path to the directory containing ChromaDB databases. Make sure it exists and can be read and written by the app. | `./chromadb` |
| dbTTL | DB_TTL | int | Time in ms before idle user-specific ChromaDB instances are shut down. | 180000 |

**4. Run the app**

```bash
npm install --only=prod
pm2 start dist/index.js --name "single-tenant-chroma-server"    # add parameters as needed
```

## Connecting and usage

```python
import chromadb
from chromadb.config import Settings

client = chromadb.HttpClient(
    host='localhost', 
    port=8000,
    settings=Settings(
        chroma_client_auth_provider="chromadb.auth.token.TokenAuthClientProvider",
        chroma_client_auth_credentials="<AUTH_TOKEN>"
    )
)
# use client as usual
```
Edit parameters accordingly (see configuration).

More info on the [official ChromaDB website](https://docs.trychroma.com/usage-guide).

## Maintenance

The setup script can be rerun to apply updates or reconfigure the environment as needed.
Keep the config.yml file updated with the correct settings.
Regularly update Node.js and Python dependencies for security and performance improvements.

## Security

This system is designed to handle sensitive tokens and databases. Treat it as such.
- It is highly recommended to ensure that HTTPS is used for secure communication.
- Deploy additional safety measures, especially if the app is directly exposed to the internet.
- Regularly monitor changes and safety issues in the dependencies. Run `npm audit` regularly.
- Monitor and rate-limit access to the app to prevent abuse.
- Ensure that the auth server can safely handle and validate user tokens. Do **not** skip validation for web accessible deployments. 
- Consider using proven cloud services like [Pinecone](https://www.pinecone.io) or [Atlas Vector Search](https://www.mongodb.com/products/platform/atlas-vector-search) instead.

> [!WARNING]
> Since we are repurposing ChromaDB's inbuilt auth token functionality for user identification, we can no longer use tokens to identify with ChromaDB directly.

## Contributing

Contributions to this project are welcome. Please follow standard GitHub flow.

## License

    Copyright 2023 Talonic
    
    Licensed under the Apache License, Version 2.0 (the "License");
    you may not use this file except in compliance with the License.
    You may obtain a copy of the License at

        http://www.apache.org/licenses/LICENSE-2.0

    Unless required by applicable law or agreed to in writing, software
    distributed under the License is distributed on an "AS IS" BASIS,
    WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
    See the License for the specific language governing permissions and
    limitations under the License.
# Installation MCP Filesystem - Serveur distant via SSH

## Prérequis
- Serveur Linux avec accès SSH
- Node.js 18+ et npm
- Git

## Installation sur le serveur

### 1. Installation des dépendances

```bash
sudo apt update
sudo apt install -y nodejs npm git
```

### 2. Vérification des versions

```bash
node --version
npm --version
```

### 3. Création des répertoires de travail

```bash
mkdir -p /home/user/mcp-workspace/{projects,documents,data,scripts}
```

### 4. Clone du repository MCP

```bash
cd /home/user
git clone https://github.com/modelcontextprotocol/servers.git
```

### 5. Installation des dépendances du serveur filesystem

```bash
cd /home/user/servers/src/filesystem
npm install
```

### 6. Compilation du serveur

```bash
npm run build
```

### 7. Vérification de la compilation

```bash
ls dist/index.js
```

### 8. Test fonctionnel du serveur

```bash
echo '{"jsonrpc": "2.0", "id": 1, "method": "tools/list", "params": {}}' | \
    node dist/index.js /home/user/mcp-workspace/projects
```

### 9. Configuration des permissions

```bash
chmod -R 755 /home/user/mcp-workspace
```

## Configuration SSH

### 1. Génération de clé SSH dédiée

```bash
ssh-keygen -t ed25519 -f ~/.ssh/id_dive_mcp -C "dive-mcp"
```

### 2. Copie de la clé publique sur le serveur

```bash
ssh-copy-id -i ~/.ssh/id_dive_mcp.pub user@192.168.1.25
```

### 3. Test de connexion SSH

```bash
ssh -i ~/.ssh/id_dive_mcp user@192.168.1.25 "echo 'Connexion SSH réussie'"
```

### 4. Test du serveur MCP via SSH

```bash
ssh -i ~/.ssh/id_dive_mcp user@192.168.1.25 \
    "cd /home/user/servers/src/filesystem && \
     echo '{\"jsonrpc\": \"2.0\", \"id\": 1, \"method\": \"tools/list\", \"params\": {}}' | \
     node dist/index.js /home/user/mcp-workspace/projects"
```

## Validation

### 1. Test de connexion

```bash
ssh -i ~/.ssh/id_dive_mcp -o ConnectTimeout=5 user@192.168.1.25 "echo 'OK'"
```

### 2. Test de fonctionnement MCP

```bash
ssh -i ~/.ssh/id_dive_mcp user@192.168.1.25 \
    "cd /home/user/servers/src/filesystem && \
     echo '{\"jsonrpc\": \"2.0\", \"id\": 1, \"method\": \"tools/list\", \"params\": {}}' | \
     timeout 5 node dist/index.js /home/user/mcp-workspace/projects"
```

### 3. Test d'écriture de fichier

```bash
ssh -i ~/.ssh/id_dive_mcp user@192.168.1.25 \
    "echo 'test' > /home/user/mcp-workspace/documents/test.txt"
```

### 4. Vérification du fichier créé

```bash
ssh -i ~/.ssh/id_dive_mcp user@192.168.1.25 \
    "test -f /home/user/mcp-workspace/documents/test.txt && echo 'Fichier créé avec succès'"
```

### 5. Nettoyage du fichier test

```bash
ssh -i ~/.ssh/id_dive_mcp user@192.168.1.25 \
    "rm /home/user/mcp-workspace/documents/test.txt"
```

## Configuration Dive AI

```json
{
  "mcpServers": {
    "filesystem": {
      "transport": "stdio",
      "enabled": true,
      "command": "ssh",
      "args": [
        "-i",
        "/home/$USER/.ssh/id_dive_mcp",
        "-o",
        "StrictHostKeyChecking=no",
        "-o",
        "UserKnownHostsFile=/dev/null",
        "user@192.168.1.25",
        "cd /home/user/servers/src/filesystem && node dist/index.js /home/user/mcp-workspace/projects /home/user/mcp-workspace/documents /home/user/mcp-workspace/data /home/user/mcp-workspace/scripts"
      ],
      "env": {},
      "url": null,
      "headers": null
    }
  }
}
```
import express from "express";
import { existsSync, unlinkSync, readdirSync, createReadStream} from "fs";
import { join } from "path";
import { request } from "http";
import { spawn } from "child_process";
import { createInterface } from "readline";

const app = express();
const LOG_DIR = "/logs";
const PARSED_LOG_DIR = "/logs-parsed";
const SOCKET_PATH = process.env.SOCKET_PATH;
const SOCKET_NAME = "Apps-Logs";
const startrun = new Date();
const now = startrun.toISOString().replace("Z","254756Z");
const nowtimestamp = Math.floor(startrun / 1000);
const earlier = new Date(startrun-10000).toISOString().replace("Z","254756Z");





// Fonction pour faire des requêtes au docker.sock original (si disponible)
function dockersock_get(path) {
    return new Promise((resolve) => {
        const req = request({
            socketPath: "/var/run/docker.sock",
            path: "http://localhost/"+path,
            method: "GET"
        }, res => {
            let data = "";
            res.on("data", chunk => {
                data += chunk;
            });
            res.on("end", () => {
                resolve(data);
            });
        });

        req.on("error", () => resolve(false));
        req.end();
    });
}
// Check si le Docker.sock est accessible
var SOCKETORIGINE = false
if (await dockersock_get("_ping") == "OK"){
    SOCKETORIGINE = true
}
// Reccupère les info du socket docker de la machine s'il existe
if (SOCKETORIGINE){
    var DOCKERSOCKINFO = JSON.parse(await dockersock_get("info"))
    var DOCKERSOCKVERSION = JSON.parse(await dockersock_get("version"))
    // On réattribut un ID aléatoire pour que Dozzle dicerne les deux instances différente
    DOCKERSOCKINFO.Name = SOCKET_NAME
    DOCKERSOCKINFO.ID = "d41be0a7-7bdb-4afd-bbc9-c39cefcb2d25"
}

// Supprimer ancien socket si présent
try {
  if (existsSync(SOCKET_PATH)) {
    unlinkSync(SOCKET_PATH);
  }
} catch (err) {
  console.error("Error removing old socket:", err);
}





// Retirer la version du docker API si elle est dans le chemin de la requete
app.use((req, res, next) => {
  req.url = req.url.replace(/^\/v[0-9.]+/, "");
  next();
});

app.get("/_ping", (req, res) => {
  res.send("OK");
});

// Interroge le socker d'origine ou creer une version factice
app.get("/version", (req, res) => {
  if (SOCKETORIGINE){
    res.json(DOCKERSOCKVERSION);
  } else {
    res.json({
        Platform: { Name: "Docker Desktop 4.60.1 (218372)" },
        Components: [],
        Version: "29.2.0",
        ApiVersion: "1.47",
        MinAPIVersion: "1.24",
        GitCommit: "fake",
        GoVersion: "go1.20",
        Os: "linux",
        Arch: "amd64",
        KernelVersion: "6.12.67-linuxkit",
        BuildTime: "2026-01-26T19:26:07.000000000+00:00"
    })
  }
});

// Interroge le socker d'origine ou creer une version factice
app.get("/info", (req, res) => {
  if (SOCKETORIGINE){
    res.json(DOCKERSOCKINFO);
  } else {
  res.json({
    ID: "d41be0a7-7bdb-4afd-bbc9-c39cefcb2d25",
    Containers: 0,
    ContainersRunning: 0,
    ContainersPaused: 0,
    ContainersStopped: 0,
    Images: 0,
    Driver: "overlay2",
    DriverStatus: [],
    Plugins: {},
    MemoryLimit: true,
    SwapLimit: true,
    CpuCfsPeriod: true,
    CpuCfsQuota: true,
    CPUShares: true,
    CPUSet: true,
    PidsLimit: true,
    IPv4Forwarding: true,
    Debug: false,
    NFd: 0,
    OomKillDisable: false,
    NGoroutines: 0,
    SystemTime: now,
    LoggingDriver: "",
    CgroupDriver: "",
    CgroupVersion: "",
    NEventsListener: 0,
    KernelVersion: "",
    OperatingSystem: "Debian GNU/Linux 12 (bookworm)",
    OSVersion: "",
    OSType: "linux",
    Architecture: "x86_64",
    IndexServerAddress: "",
    RegistryConfig: {},
    NCPU: 12,
    MemTotal: 8216813568,
    GenericResources: null,
    DockerRootDir: "",
    HttpProxy: "",
    HttpsProxy: "",
    NoProxy: "",
    Name: SOCKET_NAME,
    Labels: [],
    ExperimentalBuild: false,
    ServerVersion: "29.2.0",
    Runtimes: {},
    DefaultRuntime: "",
    Swarm: {},
    LiveRestoreEnabled: false,
    Isolation: "",
    InitBinary: "",
    ContainerdCommit: {},
    RuncCommit: {},
    InitCommit: {},
    SecurityOptions: [],
    CDISpecDirs: [],
    Containerd: {},
    Warnings: null
  })
  }
});

// Envois une version factice et vide de docker events
app.get("/events", (req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Transfer-Encoding", "chunked");

  // Limite a deux secondes car Dozzle considere instable si >3s
  const interval = setInterval(() => {
    res.write("\n");
  }, 86400000);

  req.on("close", () => {
    clearInterval(interval);
  });
});








// Cree un id unique pour chaques fichier .log
function fileToId(filename) {
  return Buffer.from(filename).toString("hex").slice(0, 12);
}
// Retourner un tableau des containers basé sur les fichiers .log
function getContainers() {
  // Retourne une liste des fichiers .log
  const files = readdirSync(LOG_DIR).filter(f => f.endsWith(".log"));
  // Remape le tableau avec: pour chaques fichier -> le remplace par les infos de container
  return files.map(file => {
    const id = fileToId(file);
    return {
      Id: id,
      Names: [`/${file.replace(".log", "")}`],
      Image: "logfile",
      ImageID: id+file.replace(".log", ""),
      Command: "",
      Created: nowtimestamp - 10,
      State: "running",
      Status: "Up 5 seconds",
      Ports: [],
      Labels: {},
      SizeRw: 0,
      SizeRootFs: 0,
      HostConfig: {},
      NetworkSettings: {},
      Mounts: [],
      _file: file // need for read log function
    };
  });
}
// Retourne un container par son id parmis le tableau
function findContainer(id) {
  return getContainers().find(c => c.Id === id);
}


// Crée une liste de containers factices
let CONTAINERS = [];
// Retourne une liste de containers factices basé sur les fichiers .log à la requette API "/containers/json" (API "List containers")
app.get("/containers/json", (req, res) => {
  if (CONTAINERS.length == 0) {
    CONTAINERS = getContainers();
  }
  res.json(CONTAINERS);
});

// Retourne les infos factice d'un container specifique à la requette "/containers/:id/json" (API "Inspect a container")
app.get("/containers/:id/json", (req, res) => {
  const container = findContainer(req.params.id);
  res.json({
    AppArmorProfile: "",
    Args: [],
    Config: {},
    Created: earlier,
    Driver: "overlay2",
    ExecIDs: [],
    HostConfig: {},
    HostnamePath: "",
    HostsPath: "",
    LogPath: "",
    Id: container.Id,
    Image: container.Image,
    MountLabel: "",
    Name: container.Names[0],
    NetworkSettings: {},
    Path: "",
    ProcessLabel: "",
    ResolvConfPath: "",
    RestartCount: 1,
    State: {
        Error: "",
        ExitCode: 0,
        FinishedAt: "",
        Health: {},
        OOMKilled: false,
        Dead: false,
        Paused: false,
        Pid: 0,
        Restarting: false,
        Running: true,
        StartedAt: now,
        Status: container.State
    },
    Mounts: container.Mounts,
  });
});

// Simule et envois de stats factice pour un container donnée (id) (API "Get container stats based on resource usage")
app.get("/containers/:id/stats", (req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Transfer-Encoding", "chunked");

  const payload = {
    read: new Date().toISOString(),
    pids_stats: {},
    networks: {},
    memory_stats: {},
    blkio_stats: {},
    cpu_stats: {},
    precpu_stats: {}
  };

  // Limite a deux secondes car Dozzle considere instable si >3s
  const interval = setInterval(() => {
    res.write(JSON.stringify(payload) + "\n");
  }, 86400000);

  req.on("close", () => {
    clearInterval(interval);
  });
});




// Fonction pour créer un frame Docker log
function dockerLogFrame(streamType, message) {
  const payload = Buffer.from(message);
  const header = Buffer.alloc(8);

  header.writeUInt8(streamType, 0);
  header.writeUInt32BE(payload.length, 4);

  return Buffer.concat([header, payload]);
}

// Lecture des logs JSON générés par Fluentd
app.get("/containers/:id/logs", async (req, res) => {
  const id = req.params.id;
  const follow = req.query.follow === "1";
  const timestamps = req.query.timestamps === "1";
  const tail = req.query.tail || "100";
  const since = parseFloat(req.query.since || "0");
  const until = parseFloat(req.query.until || "0");

  const container = findContainer(id);
  if (!container) return res.status(404).end();
  
  const containerName = container.Names[0].substring(1); // Enlever le /
  
  // Le fichier JSON est simplement containerName.json
  const logFile = join(PARSED_LOG_DIR, `${containerName}.json`);
  
  if (!existsSync(logFile)) {
    console.log(`[${containerName}] Fichier JSON non trouvé: ${logFile}`);
    return res.status(404).end();
  }

  console.log(`[${containerName}] follow=${follow}, tail=${tail}, fichier=${containerName}.json`);

  res.setHeader("Content-Type", "application/octet-stream");
  res.setHeader("Transfer-Encoding", "chunked");
  res.write("");

  function sendLine(logEntry) {
    // Chercher le champ message ou log (créé par Fluentd)
    let output = logEntry.message || logEntry.log || "";
    
    // Ajouter le timestamp si demandé
    if (timestamps && logEntry.timestamp) {
      output = `${logEntry.timestamp} ${output}`;
    }
    
      res.write(dockerLogFrame(1, output + "\n"));
  }

  // Mode follow : envoyer les dernières lignes puis suivre en temps réel
  if (follow) {
    // Lire les dernières lignes du fichier
    const numLines = parseInt(tail) || 100;
    const lines = [];
    
    // Lire tout le fichier pour avoir les dernières lignes
    const fileStream = createReadStream(logFile, { encoding: 'utf8' });
    const rl = createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    for await (const line of rl) {
      if (line.trim()) {
        try {
          const logEntry = JSON.parse(line);
          lines.push(logEntry);
        } catch (e) {
          // Ignorer les lignes mal formées
        }
      }
    }

    // Garder seulement les N dernières lignes
    const linesToSend = lines.slice(-numLines);
    console.log(`[${containerName}] Envoi de ${linesToSend.length} lignes initiales`);
    
    linesToSend.forEach(sendLine);
    
    // Lancer tail -F pour suivre les nouvelles lignes JSON
    const tailProcess = spawn("tail", ["-n", "0", "-F", logFile]);
    let buffer = "";

    tailProcess.stdout.on("data", chunk => {
      buffer += chunk.toString();
      const newLines = buffer.split("\n");
      buffer = newLines.pop();

      newLines.forEach(line => {
        if (line.trim()) {
          try {
            const logEntry = JSON.parse(line);
            sendLine(logEntry);
          } catch (e) {
            // Ignorer les lignes mal formées
          }
        }
      });
    });

    tailProcess.stderr.on("data", () => {});

    tailProcess.on("close", () => {
      if (buffer.trim()) {
        try {
          const logEntry = JSON.parse(buffer);
          sendLine(logEntry);
        } catch (e) {}
      }
      res.end();
    });

    req.on("close", () => {
      tailProcess.kill("SIGTERM");
      console.log(`[${containerName}] Connexion fermée`);
    });
  } 
  // Mode sans follow : envoyer les lignes filtrées par timestamp
  else {
    console.log(`[${containerName}] Mode scroll, since=${since}, until=${until}`);
      
    const numLines = parseInt(tail) || 300;
    const lines = [];
    
    // Lire tout le fichier
    const fileStream = createReadStream(logFile, { encoding: 'utf8' });
    const rl = createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    for await (const line of rl) {
      if (line.trim()) {
        try {
          const logEntry = JSON.parse(line);
          
          // Filtrer par timestamp si since/until sont fournis
          if (logEntry.timestamp) {
            const logTime = new Date(logEntry.timestamp).getTime() / 1000;
            
            // Si since et until sont fournis, filtrer
            if (since > 0 && until > 0) {
              if (logTime >= Math.min(since, until) && logTime <= Math.max(since, until)) {
                lines.push(logEntry);
              }
            } else if (since > 0) {
              if (logTime >= since) {
                lines.push(logEntry);
              }
            } else if (until > 0) {
              if (logTime <= until) {
                lines.push(logEntry);
              }
    } else {
              lines.push(logEntry);
            }
          } else {
            lines.push(logEntry);
          }
        } catch (e) {
          // Ignorer les lignes mal formées
        }
      }
    }

    // Garder seulement les N dernières lignes
    const linesToSend = lines.slice(-numLines);
    console.log(`[${containerName}] Envoi de ${linesToSend.length} lignes (filtré par timestamp)`);
    
    linesToSend.forEach(sendLine);
    res.end();
  }
});



// Demarre l'ecoute sur un socket afin de le creer
app.listen(SOCKET_PATH, () => {
  console.log("Listening on Unix socket:", SOCKET_PATH);
});
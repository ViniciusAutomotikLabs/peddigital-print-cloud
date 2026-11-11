# PedDigital Print Cloud

Relay seguro:

```
Cliente (4G/5G) → HTTPS nuvem → fila autenticada → Android (Wi‑Fi do salão) → Bematech
```

- Cliente **não** entra na Wi‑Fi do estabelecimento
- Android só **puxa** jobs com `AGENT_TOKEN` (nada escuta na porta do salão para a internet)
- Rate limit por IP e por mesa
- Pedido rejeitado se o agente Android estiver offline

## Subir

```bash
export AGENT_TOKEN=...   # mesmo token do APK
export PUBLIC_SLUG=demo
npm start
```

Cardápio: `http://localhost:8790/m/demo?mesa=12`

## Android

No APK (⚙):
- URL da nuvem = URL pública HTTPS
- Token = `AGENT_TOKEN`
- QR mostrado = link público do cardápio (para colar na mesa)

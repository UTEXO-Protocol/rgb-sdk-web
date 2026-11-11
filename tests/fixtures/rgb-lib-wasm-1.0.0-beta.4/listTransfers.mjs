// Captured from @utexo/rgb-lib-wasm 1.0.0-beta.4 by `npm run capture:fixtures`.
// Do not edit by hand: rerun the capture. Values are kept as the runtime built
// them (BigInt, Map, undefined); `types` lists the kind at every path.
export const meta = {
  "runtime": "@utexo/rgb-lib-wasm",
  "version": "1.0.0-beta.4",
  "wasmSha256": "cd46c01d4a0b0569efe17812c46a060e2b3a82088ca7b83a1edbbe279d0ac4df",
  "source": "captured",
  "capturedAt": 1794395066962,
  "method": "listTransfers"
};

export const samples = [
  {
    label: "sender: pending sends",
    types: {"$":"array","$[0]":"object","$[0].idx":"number","$[0].batchTransferIdx":"number","$[0].createdAt":"bigint","$[0].updatedAt":"bigint","$[0].status":"string","$[0].requestedAssignment":"undefined","$[0].assignments":"array","$[0].assignments[0]":"object","$[0].assignments[0].Fungible":"bigint","$[0].assignments[1]":"object","$[0].assignments[1].Fungible":"bigint","$[0].kind":"string","$[0].txid":"undefined","$[0].recipientId":"undefined","$[0].receiveUtxo":"undefined","$[0].changeUtxo":"undefined","$[0].expirationTimestamp":"undefined","$[0].transportEndpoints":"array","$[0].senderTransportEndpoint":"undefined","$[0].invoiceString":"undefined","$[0].consignmentPath":"string","$[0].burnReason":"undefined","$[1]":"object","$[1].idx":"number","$[1].batchTransferIdx":"number","$[1].createdAt":"bigint","$[1].updatedAt":"bigint","$[1].status":"string","$[1].requestedAssignment":"object","$[1].requestedAssignment.Fungible":"bigint","$[1].assignments":"array","$[1].assignments[0]":"object","$[1].assignments[0].Fungible":"bigint","$[1].kind":"string","$[1].txid":"string","$[1].recipientId":"string","$[1].receiveUtxo":"undefined","$[1].changeUtxo":"object","$[1].changeUtxo.txid":"string","$[1].changeUtxo.vout":"number","$[1].expirationTimestamp":"bigint","$[1].transportEndpoints":"array","$[1].transportEndpoints[0]":"object","$[1].transportEndpoints[0].endpoint":"string","$[1].transportEndpoints[0].transportType":"string","$[1].transportEndpoints[0].used":"boolean","$[1].senderTransportEndpoint":"string","$[1].invoiceString":"undefined","$[1].consignmentPath":"string","$[1].burnReason":"undefined","$[2]":"object","$[2].idx":"number","$[2].batchTransferIdx":"number","$[2].createdAt":"bigint","$[2].updatedAt":"bigint","$[2].status":"string","$[2].requestedAssignment":"object","$[2].requestedAssignment.Fungible":"bigint","$[2].assignments":"array","$[2].assignments[0]":"object","$[2].assignments[0].Fungible":"bigint","$[2].kind":"string","$[2].txid":"string","$[2].recipientId":"string","$[2].receiveUtxo":"undefined","$[2].changeUtxo":"object","$[2].changeUtxo.txid":"string","$[2].changeUtxo.vout":"number","$[2].expirationTimestamp":"bigint","$[2].transportEndpoints":"array","$[2].transportEndpoints[0]":"object","$[2].transportEndpoints[0].endpoint":"string","$[2].transportEndpoints[0].transportType":"string","$[2].transportEndpoints[0].used":"boolean","$[2].senderTransportEndpoint":"string","$[2].invoiceString":"undefined","$[2].consignmentPath":"string","$[2].burnReason":"undefined"},
    value: [
      {
        idx: 1,
        batchTransferIdx: 1,
        createdAt: 1794395080n,
        updatedAt: 1794395080n,
        status: "Settled",
        requestedAssignment: undefined,
        assignments: [
          {
            Fungible: 500n,
          },
          {
            Fungible: 1000n,
          },
        ],
        kind: "Issuance",
        txid: undefined,
        recipientId: undefined,
        receiveUtxo: undefined,
        changeUtxo: undefined,
        expirationTimestamp: undefined,
        transportEndpoints: [],
        senderTransportEndpoint: undefined,
        invoiceString: undefined,
        consignmentPath: "e2e-1a1ca47d398/d78e9893/assets/rgb:lOKTMMxy-CNrTQRP-TuKtHNs-VSPlEuk-pobg33H-kAB0bdQ",
        burnReason: undefined,
      },
      {
        idx: 4,
        batchTransferIdx: 4,
        createdAt: 1794395093n,
        updatedAt: 1794395093n,
        status: "WaitingCounterparty",
        requestedAssignment: {
          Fungible: 100n,
        },
        assignments: [
          {
            Fungible: 400n,
          },
        ],
        kind: "Send",
        txid: "7c663454e06761e8249930ec7c6f8ba39890f0f2af13ef3742fb24a16397e09e",
        recipientId: "bcrt:utxob:ZWvefwMb-EjT014C-PDnhUQ4-6RYyJ98-1L5uy_d-zkH~VFV-Ofn44",
        receiveUtxo: undefined,
        changeUtxo: {
          txid: "7c663454e06761e8249930ec7c6f8ba39890f0f2af13ef3742fb24a16397e09e",
          vout: 1,
        },
        expirationTimestamp: 1794398092n,
        transportEndpoints: [
          {
            endpoint: "http://127.0.0.1:3002/json-rpc",
            transportType: "JsonRpc",
            used: true,
          },
        ],
        senderTransportEndpoint: "http://127.0.0.1:3002/json-rpc",
        invoiceString: undefined,
        consignmentPath: "e2e-1a1ca47d398/d78e9893/transfers/7c663454e06761e8249930ec7c6f8ba39890f0f2af13ef3742fb24a16397e09e/lOKTMMxy-CNrTQRP-TuKtHNs-VSPlEuk-pobg33H-kAB0bdQ/consignment_out",
        burnReason: undefined,
      },
      {
        idx: 5,
        batchTransferIdx: 5,
        createdAt: 1794395093n,
        updatedAt: 1794395093n,
        status: "WaitingCounterparty",
        requestedAssignment: {
          Fungible: 50n,
        },
        assignments: [
          {
            Fungible: 950n,
          },
        ],
        kind: "Send",
        txid: "8424f881091192d6d69576cd5eb8eb9cb7cd089c7a248019dc89d28b8f21a30f",
        recipientId: "bcrt:wvout:BStVpzGH-ur7Y57V-NHUO6pg-WmMvk9B-1aAUgIW-1JBPAyY-cuaqqFg",
        receiveUtxo: undefined,
        changeUtxo: {
          txid: "8424f881091192d6d69576cd5eb8eb9cb7cd089c7a248019dc89d28b8f21a30f",
          vout: 2,
        },
        expirationTimestamp: 1794398092n,
        transportEndpoints: [
          {
            endpoint: "http://127.0.0.1:3002/json-rpc",
            transportType: "JsonRpc",
            used: true,
          },
        ],
        senderTransportEndpoint: "http://127.0.0.1:3002/json-rpc",
        invoiceString: undefined,
        consignmentPath: "e2e-1a1ca47d398/d78e9893/transfers/8424f881091192d6d69576cd5eb8eb9cb7cd089c7a248019dc89d28b8f21a30f/lOKTMMxy-CNrTQRP-TuKtHNs-VSPlEuk-pobg33H-kAB0bdQ/consignment_out",
        burnReason: undefined,
      },
    ],
  },
  {
    label: "sender: settled sends",
    types: {"$":"array","$[0]":"object","$[0].idx":"number","$[0].batchTransferIdx":"number","$[0].createdAt":"bigint","$[0].updatedAt":"bigint","$[0].status":"string","$[0].requestedAssignment":"undefined","$[0].assignments":"array","$[0].assignments[0]":"object","$[0].assignments[0].Fungible":"bigint","$[0].assignments[1]":"object","$[0].assignments[1].InflationRight":"bigint","$[0].kind":"string","$[0].txid":"undefined","$[0].recipientId":"undefined","$[0].receiveUtxo":"undefined","$[0].changeUtxo":"undefined","$[0].expirationTimestamp":"undefined","$[0].transportEndpoints":"array","$[0].senderTransportEndpoint":"undefined","$[0].invoiceString":"undefined","$[0].consignmentPath":"string","$[0].burnReason":"undefined","$[1]":"object","$[1].idx":"number","$[1].batchTransferIdx":"number","$[1].createdAt":"bigint","$[1].updatedAt":"bigint","$[1].status":"string","$[1].requestedAssignment":"object","$[1].requestedAssignment.Fungible":"bigint","$[1].assignments":"array","$[1].assignments[0]":"object","$[1].assignments[0].InflationRight":"bigint","$[1].assignments[1]":"object","$[1].assignments[1].Fungible":"bigint","$[1].kind":"string","$[1].txid":"string","$[1].recipientId":"string","$[1].receiveUtxo":"object","$[1].receiveUtxo.txid":"string","$[1].receiveUtxo.vout":"number","$[1].changeUtxo":"object","$[1].changeUtxo.txid":"string","$[1].changeUtxo.vout":"number","$[1].expirationTimestamp":"undefined","$[1].transportEndpoints":"array","$[1].senderTransportEndpoint":"undefined","$[1].invoiceString":"undefined","$[1].consignmentPath":"string","$[1].burnReason":"undefined"},
    value: [
      {
        idx: 2,
        batchTransferIdx: 2,
        createdAt: 1794395080n,
        updatedAt: 1794395080n,
        status: "Settled",
        requestedAssignment: undefined,
        assignments: [
          {
            Fungible: 500n,
          },
          {
            InflationRight: 500n,
          },
        ],
        kind: "Issuance",
        txid: undefined,
        recipientId: undefined,
        receiveUtxo: undefined,
        changeUtxo: undefined,
        expirationTimestamp: undefined,
        transportEndpoints: [],
        senderTransportEndpoint: undefined,
        invoiceString: undefined,
        consignmentPath: "e2e-1a1ca47d398/d78e9893/assets/rgb:K0cOwU~O-pNE3dtY-SscYX7v-lD9fEL3-AimDJAz-PpxkYQE",
        burnReason: undefined,
      },
      {
        idx: 3,
        batchTransferIdx: 3,
        createdAt: 1794395080n,
        updatedAt: 1794395080n,
        status: "Settled",
        requestedAssignment: {
          Fungible: 200n,
        },
        assignments: [
          {
            InflationRight: 300n,
          },
          {
            Fungible: 200n,
          },
        ],
        kind: "Inflation",
        txid: "c80e82b3854f66a1b3bfc09941b84dcca8830218664857ed14f2532197a2a2c6",
        recipientId: "bcrt:wvout:BZX4UN2Y-XE3cSH_-wk4ox_w-uKvbuZm-SqHqzYm-sPXx3Gw-Sv62tKA",
        receiveUtxo: {
          txid: "c80e82b3854f66a1b3bfc09941b84dcca8830218664857ed14f2532197a2a2c6",
          vout: 1,
        },
        changeUtxo: {
          txid: "c80e82b3854f66a1b3bfc09941b84dcca8830218664857ed14f2532197a2a2c6",
          vout: 2,
        },
        expirationTimestamp: undefined,
        transportEndpoints: [],
        senderTransportEndpoint: undefined,
        invoiceString: undefined,
        consignmentPath: "e2e-1a1ca47d398/d78e9893/transfers/c80e82b3854f66a1b3bfc09941b84dcca8830218664857ed14f2532197a2a2c6/K0cOwU~O-pNE3dtY-SscYX7v-lD9fEL3-AimDJAz-PpxkYQE/consignment_out",
        burnReason: undefined,
      },
    ],
  },
  {
    label: "receiver: pending receives",
    types: {"$":"array","$[0]":"object","$[0].idx":"number","$[0].batchTransferIdx":"number","$[0].createdAt":"bigint","$[0].updatedAt":"bigint","$[0].status":"string","$[0].requestedAssignment":"string","$[0].assignments":"array","$[0].kind":"string","$[0].txid":"undefined","$[0].recipientId":"string","$[0].receiveUtxo":"object","$[0].receiveUtxo.txid":"string","$[0].receiveUtxo.vout":"number","$[0].changeUtxo":"undefined","$[0].expirationTimestamp":"bigint","$[0].transportEndpoints":"array","$[0].transportEndpoints[0]":"object","$[0].transportEndpoints[0].endpoint":"string","$[0].transportEndpoints[0].transportType":"string","$[0].transportEndpoints[0].used":"boolean","$[0].senderTransportEndpoint":"undefined","$[0].invoiceString":"string","$[0].consignmentPath":"undefined","$[0].burnReason":"undefined","$[1]":"object","$[1].idx":"number","$[1].batchTransferIdx":"number","$[1].createdAt":"bigint","$[1].updatedAt":"bigint","$[1].status":"string","$[1].requestedAssignment":"string","$[1].assignments":"array","$[1].kind":"string","$[1].txid":"undefined","$[1].recipientId":"string","$[1].receiveUtxo":"undefined","$[1].changeUtxo":"undefined","$[1].expirationTimestamp":"bigint","$[1].transportEndpoints":"array","$[1].transportEndpoints[0]":"object","$[1].transportEndpoints[0].endpoint":"string","$[1].transportEndpoints[0].transportType":"string","$[1].transportEndpoints[0].used":"boolean","$[1].senderTransportEndpoint":"undefined","$[1].invoiceString":"string","$[1].consignmentPath":"undefined","$[1].burnReason":"undefined"},
    value: [
      {
        idx: 1,
        batchTransferIdx: 1,
        createdAt: 1794395092n,
        updatedAt: 1794395092n,
        status: "WaitingCounterparty",
        requestedAssignment: "Any",
        assignments: [],
        kind: "ReceiveBlind",
        txid: undefined,
        recipientId: "bcrt:utxob:ZWvefwMb-EjT014C-PDnhUQ4-6RYyJ98-1L5uy_d-zkH~VFV-Ofn44",
        receiveUtxo: {
          txid: "79558fa7c4be3fd5789b3a7d7320cb1a3f10ae117b9240f901da172ebc1c5e64",
          vout: 3,
        },
        changeUtxo: undefined,
        expirationTimestamp: 1794398692n,
        transportEndpoints: [
          {
            endpoint: "http://127.0.0.1:3002/json-rpc",
            transportType: "JsonRpc",
            used: false,
          },
        ],
        senderTransportEndpoint: undefined,
        invoiceString: "rgb:~/~/~/bcrt:utxob:ZWvefwMb-EjT014C-PDnhUQ4-6RYyJ98-1L5uy_d-zkH~VFV-Ofn44?expiry=1794398692&pk=037e98730c1adf06cb3ffd48ac6fde3720064ac713d7aead4551eef9d18ba24b&endpoints=rpc://127.0.0.1:3002/json-rpc",
        consignmentPath: undefined,
        burnReason: undefined,
      },
      {
        idx: 2,
        batchTransferIdx: 2,
        createdAt: 1794395092n,
        updatedAt: 1794395092n,
        status: "WaitingCounterparty",
        requestedAssignment: "Any",
        assignments: [],
        kind: "ReceiveWitness",
        txid: undefined,
        recipientId: "bcrt:wvout:BStVpzGH-ur7Y57V-NHUO6pg-WmMvk9B-1aAUgIW-1JBPAyY-cuaqqFg",
        receiveUtxo: undefined,
        changeUtxo: undefined,
        expirationTimestamp: 1794398692n,
        transportEndpoints: [
          {
            endpoint: "http://127.0.0.1:3002/json-rpc",
            transportType: "JsonRpc",
            used: false,
          },
        ],
        senderTransportEndpoint: undefined,
        invoiceString: "rgb:~/~/~/bcrt:wvout:BStVpzGH-ur7Y57V-NHUO6pg-WmMvk9B-1aAUgIW-1JBPAyY-cuaqqFg?expiry=1794398692&pk=731c61c56b134e245ddc9a986d2c5c12ae0eaf846a69d301c20945d621d90008&endpoints=rpc://127.0.0.1:3002/json-rpc",
        consignmentPath: undefined,
        burnReason: undefined,
      },
    ],
  },
  {
    label: "receiver: settled receives",
    types: {"$":"array","$[0]":"object","$[0].idx":"number","$[0].batchTransferIdx":"number","$[0].createdAt":"bigint","$[0].updatedAt":"bigint","$[0].status":"string","$[0].requestedAssignment":"string","$[0].assignments":"array","$[0].assignments[0]":"object","$[0].assignments[0].Fungible":"bigint","$[0].kind":"string","$[0].txid":"string","$[0].recipientId":"string","$[0].receiveUtxo":"object","$[0].receiveUtxo.txid":"string","$[0].receiveUtxo.vout":"number","$[0].changeUtxo":"undefined","$[0].expirationTimestamp":"bigint","$[0].transportEndpoints":"array","$[0].transportEndpoints[0]":"object","$[0].transportEndpoints[0].endpoint":"string","$[0].transportEndpoints[0].transportType":"string","$[0].transportEndpoints[0].used":"boolean","$[0].senderTransportEndpoint":"string","$[0].invoiceString":"string","$[0].consignmentPath":"string","$[0].burnReason":"undefined","$[1]":"object","$[1].idx":"number","$[1].batchTransferIdx":"number","$[1].createdAt":"bigint","$[1].updatedAt":"bigint","$[1].status":"string","$[1].requestedAssignment":"string","$[1].assignments":"array","$[1].assignments[0]":"object","$[1].assignments[0].Fungible":"bigint","$[1].kind":"string","$[1].txid":"string","$[1].recipientId":"string","$[1].receiveUtxo":"object","$[1].receiveUtxo.txid":"string","$[1].receiveUtxo.vout":"number","$[1].changeUtxo":"undefined","$[1].expirationTimestamp":"bigint","$[1].transportEndpoints":"array","$[1].transportEndpoints[0]":"object","$[1].transportEndpoints[0].endpoint":"string","$[1].transportEndpoints[0].transportType":"string","$[1].transportEndpoints[0].used":"boolean","$[1].senderTransportEndpoint":"string","$[1].invoiceString":"string","$[1].consignmentPath":"string","$[1].burnReason":"undefined"},
    value: [
      {
        idx: 1,
        batchTransferIdx: 1,
        createdAt: 1794395092n,
        updatedAt: 1794395092n,
        status: "Settled",
        requestedAssignment: "Any",
        assignments: [
          {
            Fungible: 100n,
          },
        ],
        kind: "ReceiveBlind",
        txid: "7c663454e06761e8249930ec7c6f8ba39890f0f2af13ef3742fb24a16397e09e",
        recipientId: "bcrt:utxob:ZWvefwMb-EjT014C-PDnhUQ4-6RYyJ98-1L5uy_d-zkH~VFV-Ofn44",
        receiveUtxo: {
          txid: "79558fa7c4be3fd5789b3a7d7320cb1a3f10ae117b9240f901da172ebc1c5e64",
          vout: 3,
        },
        changeUtxo: undefined,
        expirationTimestamp: 1794398692n,
        transportEndpoints: [
          {
            endpoint: "http://127.0.0.1:3002/json-rpc",
            transportType: "JsonRpc",
            used: true,
          },
        ],
        senderTransportEndpoint: "http://127.0.0.1:3002/json-rpc",
        invoiceString: "rgb:~/~/~/bcrt:utxob:ZWvefwMb-EjT014C-PDnhUQ4-6RYyJ98-1L5uy_d-zkH~VFV-Ofn44?expiry=1794398692&pk=037e98730c1adf06cb3ffd48ac6fde3720064ac713d7aead4551eef9d18ba24b&endpoints=rpc://127.0.0.1:3002/json-rpc",
        consignmentPath: "e2e-1a1ca47d4ea/ae9b84b0/transfers/bcrt_utxob_ZWvefwMb-EjT014C-PDnhUQ4-6RYyJ98-1L5uy_d-zkH~VFV-Ofn44/rcv_compose.rgbc",
        burnReason: undefined,
      },
      {
        idx: 2,
        batchTransferIdx: 2,
        createdAt: 1794395092n,
        updatedAt: 1794395092n,
        status: "Settled",
        requestedAssignment: "Any",
        assignments: [
          {
            Fungible: 50n,
          },
        ],
        kind: "ReceiveWitness",
        txid: "8424f881091192d6d69576cd5eb8eb9cb7cd089c7a248019dc89d28b8f21a30f",
        recipientId: "bcrt:wvout:BStVpzGH-ur7Y57V-NHUO6pg-WmMvk9B-1aAUgIW-1JBPAyY-cuaqqFg",
        receiveUtxo: {
          txid: "8424f881091192d6d69576cd5eb8eb9cb7cd089c7a248019dc89d28b8f21a30f",
          vout: 1,
        },
        changeUtxo: undefined,
        expirationTimestamp: 1794398692n,
        transportEndpoints: [
          {
            endpoint: "http://127.0.0.1:3002/json-rpc",
            transportType: "JsonRpc",
            used: true,
          },
        ],
        senderTransportEndpoint: "http://127.0.0.1:3002/json-rpc",
        invoiceString: "rgb:~/~/~/bcrt:wvout:BStVpzGH-ur7Y57V-NHUO6pg-WmMvk9B-1aAUgIW-1JBPAyY-cuaqqFg?expiry=1794398692&pk=731c61c56b134e245ddc9a986d2c5c12ae0eaf846a69d301c20945d621d90008&endpoints=rpc://127.0.0.1:3002/json-rpc",
        consignmentPath: "e2e-1a1ca47d4ea/ae9b84b0/transfers/bcrt_wvout_BStVpzGH-ur7Y57V-NHUO6pg-WmMvk9B-1aAUgIW-1JBPAyY-cuaqqFg/rcv_compose.rgbc",
        burnReason: undefined,
      },
    ],
  },
];

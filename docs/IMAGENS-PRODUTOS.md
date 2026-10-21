# Imagens dos produtos de teste

Concluído em 20/10/2026 com **ImageGen integrado**, sem API/CLI. As seis imagens foram inspecionadas e vinculadas ao campo `foto` dos seis produtos locais. Preços, custos, status e estoque foram preservados, com registro de auditoria. As descrições identificam as imagens como ilustrações geradas por IA para testes.

Pasta: `C:\Users\andre\Desktop\gemini-cursos\front-end\tiger-tech\projetos\nacao-animal\public\images\products\`.

| SKU | Produto | Arquivo servido |
| --- | --- | --- |
| NA-TESTE-CAES-01 | Saquinhos higiênicos para cães | test-dog-waste-bags.jpg |
| NA-TESTE-GATOS-01 | Varinha para gatos | test-cat-wand.jpg |
| NA-TESTE-AVES-01 | Poleiro para aves | test-bird-perch.jpg |
| NA-TESTE-PEIXES-01 | Enfeite para aquário | test-aquarium-ornament.jpg |
| NA-TESTE-ROEDORES-01 | Mordedor para hamster | test-rodent-chew.jpg |
| NA-TESTE-ACESSORIOS-01 | Bolinha para pets | test-pet-ball.jpg |

URLs públicas: `/images/products/<arquivo>`. Os JPEGs de 900 × 900 foram exportados para o site, somando cerca de 480 KB. Os PNGs originais com os mesmos nomes, de 1254 × 1254, estão preservados nessa pasta. A descrição e os nomes `[TESTE]` continuam claros: são dados e imagens de demonstração, sem marca comercial ou mercadoria física confirmada.

Verificação: oito páginas principais e as seis imagens retornaram HTTP 200; API confirmou todas as fotos, preços de R$ 6/R$ 10 e cinco unidades por item. Nenhum pedido ou cobrança executado. A inspeção visual do site continua pendente pelo bloqueio de navegador registrado no prompt; a inspeção dos próprios arquivos de imagem foi realizada.

## Prompts finais

### Saquinhos higiênicos

Use case: product-mockup. Asset type: square 1024x1024 product photograph for the Nação Animal pet-store catalog, an illustrative test product. Primary request: two small generic rolls of clean dog waste bags, one muted green roll and one muted blue roll, with one clean bag partially unrolled so the bag shape is recognizable. Scene/backdrop: seamless nearly white warm cream studio background and surface, soft diffuse studio lighting, subtle natural contact shadow. Composition: entire product group centered, occupying 65–75% of the square frame, generous clean margins, realistic material and scale. Style: high-quality photorealistic e-commerce product photography. Constraints: only the described bags and rolls, no animals, no people, no feces or waste, no commercial packaging, no text, no price, no logo, no brand, no watermark.

### Varinha para gatos

Use case: product-mockup. Asset type: square 1024x1024 product photograph for the Nação Animal pet-store catalog, an illustrative test product. Primary request: one simple generic cat teaser wand: a slim short natural wooden stick, a thin cord attached at the tip, and a small cluster of colorful orange, yellow and turquoise feathers on the cord. Scene/backdrop: seamless nearly white warm cream studio background and surface, soft diffuse studio lighting, subtle natural contact shadow. Composition: entire wand, whole cord and feather attachment fully visible in a compact arrangement, cord curved gently into a loose loop beside the diagonally placed stick; centered subject occupies 65–75% of square frame with generous clean margins. Style: high-quality photorealistic e-commerce product photography, realistic wood grain and delicate feather texture. Constraints: only the described cat toy, no cats or other animals, no people, no hands, no commercial packaging, no text, no price, no logo, no brand, no watermark.

### Poleiro

Use case: product-mockup. Asset type: square 1024x1024 ecommerce catalog photo for a generic pet bird perch. Primary request: a single simple natural wooden branch perch for a bird cage, with a small threaded metal mounting fastener and washers at one end. Scene/backdrop: seamless almost-white warm cream studio background. Style: photorealistic product photography, soft studio light, subtle natural contact shadow, realistic wood grain and metal details. Composition: the complete perch in a clean diagonal composition, centered and occupying 65 to 75 percent of the square frame with generous empty margins; every part of the wood and fastening hardware visible. Constraints: no birds, other animals, people, hands, cage, labels, packaging, words, prices, logos, branding, or watermark. A modest low-cost generic pet accessory, not a luxury object.

### Enfeite de aquário

Use case: product-mockup. Asset type: square 1024x1024 ecommerce catalog photo for a generic aquarium ornament. Primary request: a small inexpensive resin ornament made to look like a natural warm-gray rock formation with a low arch and a cave opening for a home fish aquarium. The resin product must look compact and realistically manufactured, with rounded surfaces and a stable flat base. Scene/backdrop: seamless almost-white warm cream studio background. Style: photorealistic product photography, soft studio lighting, subtle natural contact shadow, crisp realistic stone-like resin texture. Composition: complete ornament centered, three-quarter view, occupying 65 to 75 percent of the square frame, generous empty margins, product entirely visible. Constraints: one standalone generic product only, no aquarium, water, fish, other animals, people, hands, labels, packaging, text, prices, logos, branding or watermark. Do not depict an actual outdoor landscape or a large natural cave.

### Mordedor

Use case: product-mockup. Asset type: square 1024x1024 product catalog image for the Nação Animal pet shop. Primary request: photorealistic studio product photograph of one simple chew toy for a hamster or small rodent: a short untreated natural wooden cylinder with a few shallow grooves and clearly visible real wood grain, no varnish. Scene/backdrop: seamless nearly white warm cream studio background, subtle natural shadow. Composition/framing: entire item centered, occupying 65–75 percent of frame with generous clean margins, slightly diagonal three-quarter view. Lighting/mood: soft diffuse studio light, crisp realistic texture. Constraints: show only the wooden chew product; no animals, people, food, text, prices, logos, brand names, commercial packaging or watermark.

### Bolinha

Use case: product-mockup. Asset type: square 1024x1024 product catalog image for the Nação Animal pet shop. Primary request: photorealistic studio product photograph of one small generic orange rubber ball for pets, with a subtle evenly spaced texture of small rounded bumps, no brand markings. Scene/backdrop: seamless nearly white warm cream studio background, subtle natural shadow. Composition/framing: the complete single ball centered, occupying 65–75 percent of the square frame with generous clean margins, three-quarter studio product view. Lighting/mood: soft diffuse studio light, realistic rubber texture and crisp detail. Constraints: exactly one ball only; no animals, people, additional objects, text, prices, logos, brand names, commercial packaging or watermark.

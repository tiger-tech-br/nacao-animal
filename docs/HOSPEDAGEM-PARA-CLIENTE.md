**Nação Animal — opções de hospedagem para apresentar ao cliente**

Consulta aos sites oficiais em24/10/2026. O projeto usa Node.js22 ou superior e PostgreSQL. Precisa manter a aplicação e o banco funcionando, além de HTTPS para o site e o GPS.

Direção definida: Vixpi para a instalação definitiva; Railway para testes e demonstrações. A hospedagem definitiva ainda precisa ser contratada/configurada e testada. Compatibilidade anunciada não comprova, sozinha, desempenho, restauração de backups ou disponibilidade em uso real.

| Empresa | Referência de preço | Como se encaixa |
| --- | --- | --- |
| [Vixpi — Site Pro](https://vixpi.host/sites) | R$39,90/mês | Destino pretendido. Anuncia Node.js, PostgreSQL, HTTPS,2GB deRAM,2núcleos e30GB de disco. Selecionar Node22 ou24 e PostgreSQL na contratação. |
| [Railway — Hobby](https://railway.com/pricing) | Mínimo de US$5/mês | Ambiente atual de testes. Inclui US$5 de consumo; o uso excedente é cobrado. Aplicação e banco consomem os recursos da conta. |
| [Render](https://render.com/pricing) | Referência inicial de US$13/mês | Serviço de aplicação de US$7 mais PostgreSQL de US$6, antes de adicionais. Usa serviços separados para aplicação e banco. |
| [Hostinger — VPS KVM1](https://www.hostinger.com/br/servidor-vps) | R$29,99/mês promocionais | Servidor de4GB para instalar a aplicação e o PostgreSQL. Renovação anunciada por R$59,99/mês no ciclo de2anos. A oferta é pré-paga: o valor mensal equivale ao total dividido pelo prazo. |
| [DigitalOcean — Droplet](https://www.digitalocean.com/pricing/droplets) | Exemplo de4GB por US$24/mês | Servidor virtual. Aplicação e banco podem ser instalados nele; configuração e manutenção ficam sob responsabilidade técnica. Banco gerenciado separado tem outra cobrança. |
| [AWS — Lightsail](https://docs.aws.amazon.com/lightsail/latest/userguide/amazon-lightsail-bundles.html) | Exemplo Linux de4GB comIPv4 por US$24/mês | Outra opção de servidor virtual. Instalação, atualizações e administração do PostgreSQL precisam ser planejadas; a instância não equivale a contratar banco gerenciado. |

Os valores em dólar não foram convertidos. Recursos adicionais, impostos, câmbio e condições de contratação podem alterar o total. Compare o custo renovado, e não apenas o destaque promocional. Os exemplos de4GB são referências de comparação; não são um requisito mínimo medido do Nação Animal.

**Por que o Vixpi está na frente para este caso**

O Site Pro anuncia as tecnologias do projeto com cobrança em reais. A página informa que a memória é repartida entre aplicação, banco e cache;2GB não significam2GB exclusivos para o Node. Essa é uma compatibilidade inicial a validar na implantação. O preço menor do Site Start não deve ser usado como orçamento de Node sem conferir as engines daquele plano. [Fonte oficial](https://vixpi.host/sites).

**O que significa escolher VPS**

Hostinger VPS, Droplet e Lightsail entregam um servidor para configurar. É possível instalar o projeto e o banco, mas isso inclui cuidar do ambiente, HTTPS, atualizações e rotinas de cópia e restauração. O custo do servidor não inclui automaticamente esse trabalho técnico. [Hostinger](https://www.hostinger.com/br/servidor-vps), [DigitalOcean](https://www.digitalocean.com/pricing/droplets), [Lightsail](https://docs.aws.amazon.com/lightsail/latest/userguide/amazon-lightsail-bundles.html).

**Custos que precisam ser separados na conversa**

- Desenvolvimento e manutenção do sistema.
- Hospedagem da aplicação e do banco, conforme o plano escolhido.
- Registro e renovação do domínio, caso contratados separadamente.
- Serviços de terceiros usados no projeto: mapa/rotas, envio de e-mails, armazenamento de imagens e taxas do provedor de pagamentos, conforme as respectivas contas e consumo.

Não apresente R$39,90 como custo completo de toda a operação da loja. É a referência do plano de hospedagem consultado.

**Como explicar a decisão ao cliente**

“Estamos usando o Railway para testar e apresentar o sistema. A intenção é publicar a loja definitiva no Vixpi, no plano compatível com Node e PostgreSQL. Antes de colocar compras reais em funcionamento, vamos validar a instalação, o domínio, os e-mails e a integração de pagamentos nesse ambiente.”

Uma hospedagem apenas de páginas estáticas não substitui a aplicação e o banco deste projeto. Se algum serviço for contratado só para a parte visual, ainda será necessário hospedar o servidor e o PostgreSQL em outro lugar.

Não houve contratação, migração, troca de variáveis ou alteração de hospedagem para produzir esta comparação.

# Cloudinary — operação do PetFlow v2

Preencha no servidor `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY` e `CLOUDINARY_API_SECRET` da mesma conta. Valores vazios ou de exemplo deixam os uploads indisponíveis. Os nomes das variáveis não bastam para confirmar autenticação.

```sh
npm run check:cloudinary
npm run check:cloudinary -- --upload
```

O primeiro comando faz um ping autenticado. O segundo também envia uma imagem temporária, confere a URL HTTPS na CDN e remove o arquivo. Se o script informar falha de limpeza, remova somente o identificador temporário indicado, sem apagar a pasta inteira.

O fluxo do painel recebe até uma imagem por requisição em JPG, PNG ou WebP. O limite padrão é 5 MB; `MAX_FILE_SIZE` pode configurar um valor positivo até 20 MB. Arquivos acima do limite retornam 413; formato ou conteúdo inválido retorna 400. Credenciais indisponíveis ou falha do provedor retornam 503 sem expor chaves.

O arquivo fica em memória até a validação dos campos e a confirmação da existência do produto/empresa. O upload é assinado no servidor e usa identificador único, sem sobrescrever outro arquivo. A URL e o public ID são salvos no PostgreSQL. A migração `113_cloudinary_assets.sql` adiciona os campos sem alterar fotos existentes.

Se o banco rejeitar a gravação, o arquivo recém-enviado é removido. Na troca de foto/logo, o cadastro novo é salvo antes da remoção do anterior. Uma edição sem nova imagem preserva a URL e o ID atuais. URLs locais, de outras contas ou fora da pasta `petflow-v2` são conservadas. Desativar um produto conserva a foto.

As falhas de limpeza são registradas no servidor com `CLOUDINARY_CLEANUP_FAILED` e o public ID, para revisão manual. Arquivos sem uso anteriores a esta versão não são apagados automaticamente: a revisão não deve remover imagens que ainda possam estar referenciadas.

Para erro `cloud_name mismatch`, confira o Cloud name no painel da conta proprietária da API key. Não use o nome do projeto, um link ou o nome de exibição da conta nesse campo. API key e API secret permanecem privados no servidor.

Referências oficiais: [upload no SDK Node.js](https://cloudinary.com/documentation/node_image_and_video_upload), [Upload API e remoção de imagens](https://cloudinary.com/documentation/image_upload_api_reference).

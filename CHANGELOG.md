## [1.0.1](https://github.com/groc-prog/argus/compare/v1.0.0...v1.0.1) (2025-11-01)


### Bug Fixes

* handle missing timezone info correctly in response ([23cc127](https://github.com/groc-prog/argus/commit/23cc12705f28edace7e5954a0da1d1350536869d))

# 1.0.0 (2025-11-01)


### Bug Fixes

* message adjustments, correct feature check ([0a228a0](https://github.com/groc-prog/argus/commit/0a228a0b7266a862ce30ca9cbcbf63d510c99aad))
* **service:** make execute method private ([0411048](https://github.com/groc-prog/argus/commit/04110480920f9d6cc5ec4901e7e2b845fcefbeaa))
* **service:** multiple fixes for notification service ([559b25c](https://github.com/groc-prog/argus/commit/559b25cc53ba8fa4624d0fb188408bb4c58fefeb))
* **service:** use findOneAndUpdate with upsert instead of calling save ([08c49a4](https://github.com/groc-prog/argus/commit/08c49a44986c02b1d878fe1169bb2c0ef26c4791))
* **singleton:** prevent singleton from using same insatnce for different classes ([db141d5](https://github.com/groc-prog/argus/commit/db141d5b1eb978d550195cd15124bd00f93783f4))


### Features

* **bot, model:** add notification-interval option ([c1f1ca8](https://github.com/groc-prog/argus/commit/c1f1ca8839420d4291ffa55ae9b3b5203a14a208))
* **bot, model:** small bug fixes ([ec8f202](https://github.com/groc-prog/argus/commit/ec8f202f3a8169e3261d613cf64d0022bcbeefaa))
* **bot:** add command for deleting notification ([65a8bf6](https://github.com/groc-prog/argus/commit/65a8bf6205a6a47bd975065ea01f2e482235e0b6))
* **bot:** add command for returning available features ([5c30fce](https://github.com/groc-prog/argus/commit/5c30fcecd87de8f26c6eb6287ee5071f70384d5b))
* **bot:** add guild delete event for configuration cleanup ([a89e3c8](https://github.com/groc-prog/argus/commit/a89e3c8a1de751e108cd7764e3961658c7800a82))
* **bot:** add movie details/screenings commands, improve replies, allow for name search ([b1aa051](https://github.com/groc-prog/argus/commit/b1aa05103e3a3c4df02f82baaab97830db409c5c))
* **bot:** add notify-me, set-timezone and help commands, refactoring and improvements ([9835cb9](https://github.com/groc-prog/argus/commit/9835cb9daa5602cfe375921b3486919ae30af1d8))
* **bot:** add reactivate command ([4a034de](https://github.com/groc-prog/argus/commit/4a034de09a1e694f313f12ef9f493589d1d300e4))
* **bot:** add reply helpers and autocomplete event ([f3bfb01](https://github.com/groc-prog/argus/commit/f3bfb019409524f0c69419741efe2ea225981990))
* **bot:** basic setup for bot ([02fd8e0](https://github.com/groc-prog/argus/commit/02fd8e0c51675f5962653396178fa97e5dfb4ae9))
* **bot:** guild create event, status command improvements ([46ecf73](https://github.com/groc-prog/argus/commit/46ecf738dac4fb2cdf701813dbc9a5788e56070e))
* **bot:** improve log context, add notifications list command ([008101a](https://github.com/groc-prog/argus/commit/008101a8a8cb92f8779fbcda3573c0053e10fd92))
* **bot:** improve replies ([8a34a23](https://github.com/groc-prog/argus/commit/8a34a2308ab45c9932e536a3d6e38e4c75f458e4))
* **bot:** job scheduling for broadcasts ([81fd24f](https://github.com/groc-prog/argus/commit/81fd24f7db8e3e5ff3911f35e28547168cc34c98))
* **bot:** move shared logic to db model, add setup command ([30ce086](https://github.com/groc-prog/argus/commit/30ce086a922fd9e3a4932ff18ff83adb8727f7f5))
* **bot:** validate movie features, feature definitions ([be2ad79](https://github.com/groc-prog/argus/commit/be2ad796085bee6bc81ddc11f809b74ac6710167))
* improve bot replies, use threads, better naming conventions ([777593f](https://github.com/groc-prog/argus/commit/777593fa0f4bfe4916bcfafb22e305a339ab56c6))
* improve logging ([bee55f8](https://github.com/groc-prog/argus/commit/bee55f890a00a38d37c2c5eb351dac41e0f2c123))
* improve logging and naming conventions ([5ebb32e](https://github.com/groc-prog/argus/commit/5ebb32e0d61ee2bf5c0c637f744ee42a08aac95c))
* **model:** add database models ([361fc78](https://github.com/groc-prog/argus/commit/361fc78ff760748f6d9d5b5c00e92878943a8cfb))
* **service:** add job for removing/deactivating notifications ([3eca120](https://github.com/groc-prog/argus/commit/3eca120b37999a2f633783122447af23661333ea))
* **service:** add web scraper service ([6e4d76c](https://github.com/groc-prog/argus/commit/6e4d76ca3daabc8cf64d4290241fc4b82280e54b))
* **service:** partially implement notification service ([571a9e7](https://github.com/groc-prog/argus/commit/571a9e75aaef5c3457dc19f1e38d3c3ba0698149))
* **service:** remove old screenings when storing scraped data ([b1fa3de](https://github.com/groc-prog/argus/commit/b1fa3de1f5f7803c1f687bfc255cf1073b1a44b4))
* **service:** sending user dm ([d7ec2e9](https://github.com/groc-prog/argus/commit/d7ec2e9a708c4993564520e0a636a2f3891a7f90))
* take build version from package.json ([6a85556](https://github.com/groc-prog/argus/commit/6a85556cb15f57a85971adb7da9eb44065c35032))
* **utils:** add build version in logs ([8807122](https://github.com/groc-prog/argus/commit/8807122ebedefbf67e58b88901f88a912bd58e37))
* **utils:** reconfigure logger ([eb6e6d2](https://github.com/groc-prog/argus/commit/eb6e6d2f277e6c96f178bc06d42a13e989cf6c9a))
* **utils:** setup logger ([33ad860](https://github.com/groc-prog/argus/commit/33ad86067b7a0881651fd8535cfc2bb1fe4a7242))

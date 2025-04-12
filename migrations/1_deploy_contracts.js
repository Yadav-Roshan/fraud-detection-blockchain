const FraudLogger = artifacts.require("FraudLogger");

module.exports = function(deployer) {
  deployer.deploy(FraudLogger);
};

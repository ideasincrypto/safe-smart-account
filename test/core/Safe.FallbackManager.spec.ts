import { expect } from "chai";
import hre, { ethers } from "hardhat";
import { AddressZero } from "@ethersproject/constants";
import { defaultTokenCallbackHandlerDeployment, deployContract, getSafeTemplate, getTokenCallbackHandler, getWallets } from "../utils/setup";
import { executeContractCallWithSigners } from "../../src/utils/execution";

describe("FallbackManager", () => {
    const setupWithTemplate = hre.deployments.createFixture(async ({ deployments }) => {
        await deployments.fixture();
        const source = `
        contract Mirror {
            function lookAtMe() public returns (bytes memory) {
                return msg.data;
            }

            function nowLookAtYou(address you, string memory howYouLikeThat) public returns (bytes memory) {
                return msg.data;
            }
        }`;
        const signers = await getWallets();
        const [user1] = signers;
        const mirror = await deployContract(user1, source);
        return {
            safe: await getSafeTemplate(),
            mirror,
            signers,
        };
    });

    describe("setFallbackManager", () => {
        it("is correctly set on deployment", async () => {
            const { safe, signers } = await setupWithTemplate();
            const handler = await defaultTokenCallbackHandlerDeployment();
            const [user1, user2] = signers;

            // Check fallback handler
            await expect(
                await hre.ethers.provider.getStorage(
                    await safe.getAddress(),
                    "0x6c9a6c4a39284e37ed1cf53d337577d14212a4870fb976a4366c693b939918d5",
                ),
            ).to.be.eq("0x" + "".padStart(64, "0"));

            // Setup Safe
            await (
                await safe.setup([user1.address, user2.address], 1, AddressZero, "0x", handler.address, AddressZero, 0, AddressZero)
            ).wait();

            // Check fallback handler
            await expect(
                await hre.ethers.provider.getStorage(
                    await safe.getAddress(),
                    "0x6c9a6c4a39284e37ed1cf53d337577d14212a4870fb976a4366c693b939918d5",
                ),
            ).to.be.eq("0x" + handler.address.toLowerCase().slice(2).padStart(64, "0"));
        });

        it("is correctly set", async () => {
            const { safe, signers } = await setupWithTemplate();
            const handler = await defaultTokenCallbackHandlerDeployment();
            const [user1, user2] = signers;

            // Setup Safe
            await (await safe.setup([user1.address, user2.address], 1, AddressZero, "0x", AddressZero, AddressZero, 0, AddressZero)).wait();

            // Check fallback handler
            await expect(
                await hre.ethers.provider.getStorage(
                    await safe.getAddress(),
                    "0x6c9a6c4a39284e37ed1cf53d337577d14212a4870fb976a4366c693b939918d5",
                ),
            ).to.be.eq("0x" + "".padStart(64, "0"));

            await expect(executeContractCallWithSigners(safe, safe, "setFallbackHandler", [handler.address], [user1]))
                .to.emit(safe, "ChangedFallbackHandler")
                .withArgs(handler.address);

            // Check fallback handler
            await expect(
                await hre.ethers.provider.getStorage(
                    await safe.getAddress(),
                    "0x6c9a6c4a39284e37ed1cf53d337577d14212a4870fb976a4366c693b939918d5",
                ),
            ).to.be.eq("0x" + handler.address.toLowerCase().slice(2).padStart(64, "0"));
        });

        it("emits event when is set", async () => {
            const { safe, signers } = await setupWithTemplate();
            const handler = await defaultTokenCallbackHandlerDeployment();
            const [user1, user2] = signers;

            // Setup Safe
            await (await safe.setup([user1.address, user2.address], 1, AddressZero, "0x", AddressZero, AddressZero, 0, AddressZero)).wait();

            // Check event
            await expect(executeContractCallWithSigners(safe, safe, "setFallbackHandler", [handler.address], [user1]))
                .to.emit(safe, "ChangedFallbackHandler")
                .withArgs(handler.address);
        });

        it("is called when set", async () => {
            const { safe, signers } = await setupWithTemplate();
            const safeAddress = await safe.getAddress();
            const [user1, user2] = signers;
            const handler = await defaultTokenCallbackHandlerDeployment();
            const safeHandler = await getTokenCallbackHandler(safeAddress);
            // Check that Safe is NOT setup
            expect(await safe.getThreshold()).to.eq(0n);

            // Check unset callbacks
            // Ethers v6 throws an internal error when trying to call a non-existent function
            await expect(safeHandler.onERC1155Received.staticCall(AddressZero, AddressZero, 0, 0, "0x")).to.be.rejected;

            // Setup Safe
            await (
                await safe.setup([user1.address, user2.address], 1, AddressZero, "0x", handler.address, AddressZero, 0, AddressZero)
            ).wait();

            // Check callbacks
            expect(await safeHandler.onERC1155Received.staticCall(AddressZero, AddressZero, 0, 0, "0x")).to.be.eq("0xf23a6e61");
        });

        it("sends along msg.sender on simple call", async () => {
            const { safe, mirror, signers } = await setupWithTemplate();
            const mirrorAddress = await mirror.getAddress();
            const [user1, user2] = signers;
            // Setup Safe
            await (
                await safe.setup([user1.address, user2.address], 1, AddressZero, "0x", mirrorAddress, AddressZero, 0, AddressZero)
            ).wait();

            const tx = {
                to: await safe.getAddress(),
                data: mirror.interface.encodeFunctionData("lookAtMe"),
            };
            // Check that mock works as handler
            const response = await user1.call(tx);
            expect(response).to.be.eq(
                "0x" +
                    "0000000000000000000000000000000000000000000000000000000000000020" +
                    "0000000000000000000000000000000000000000000000000000000000000018" +
                    "7f8dc53c" +
                    user1.address.slice(2).toLowerCase() +
                    "0000000000000000",
            );
        });

        it("sends along msg.sender on more complex call", async () => {
            const { safe, mirror, signers } = await setupWithTemplate();
            const mirrorAddress = await mirror.getAddress();
            const [user1, user2] = signers;
            // Setup Safe
            await (
                await safe.setup([user1.address, user2.address], 1, AddressZero, "0x", mirrorAddress, AddressZero, 0, AddressZero)
            ).wait();

            const tx = {
                to: await safe.getAddress(),
                data: mirror.interface.encodeFunctionData("nowLookAtYou", [user2.address, "pink<>black"]),
            };
            // Check that mock works as handler
            const response = await user1.call(tx);
            expect(response).to.be.eq(
                "0x" +
                    "0000000000000000000000000000000000000000000000000000000000000020" +
                    "0000000000000000000000000000000000000000000000000000000000000098" +
                    // Function call
                    "b2a88d99" +
                    "000000000000000000000000" +
                    user2.address.slice(2).toLowerCase() +
                    "0000000000000000000000000000000000000000000000000000000000000040" +
                    "000000000000000000000000000000000000000000000000000000000000000b" +
                    "70696e6b3c3e626c61636b000000000000000000000000000000000000000000" +
                    user1.address.slice(2).toLowerCase() +
                    "0000000000000000",
            );
        });

        it("cannot be set to self", async () => {
            const { safe, signers } = await setupWithTemplate();
            const [user1] = signers;
            // Setup Safe
            await (await safe.setup([user1.address], 1, AddressZero, "0x", AddressZero, AddressZero, 0, AddressZero)).wait();

            // The transaction execution function doesn't bubble up revert messages so we check for a generic transaction fail code GS013
            await expect(
                executeContractCallWithSigners(safe, safe, "setFallbackHandler", [await safe.getAddress()], [user1]),
            ).to.be.revertedWith("GS013");
        });
    });
});
